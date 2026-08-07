const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

/**
 * CommodityToken — KYC-gated ERC-1155 for commodity-backed fractional ownership.
 *
 * The suite leans hardest on the transfer-restriction logic, since that is the
 * whole compliance claim: if a non-whitelisted address can ever end up holding
 * a token, the product is broken regardless of what the interface says.
 */

const FEED_DECIMALS = 8;
const XAU_USD = 2000n * 10n ** BigInt(FEED_DECIMALS); // $2,000 / oz
const ETH_USD = 2500n * 10n ** BigInt(FEED_DECIMALS); // $2,500 / ETH
const TROY_OUNCE_SCALED = 311034768n; // 31.1034768 × 1e7
const MAX_PRICE_AGE = 3 * 60 * 60;
const FEE_BPS = 250n; // 2.5%

/** Mirrors tokenPriceInWei so the expected value is derived, not hard-coded. */
function expectedPrice(gramsPerToken, xau = XAU_USD, eth = ETH_USD) {
  const scale = 10n ** BigInt(18 - FEED_DECIMALS);
  const assetUsd18 = xau * scale;
  const ethUsd18 = eth * scale;
  const tokenUsd18 = (assetUsd18 * BigInt(gramsPerToken) * 10n ** 7n) / TROY_OUNCE_SCALED;
  return (tokenUsd18 * 10n ** 18n) / ethUsd18;
}

async function deploy() {
  const [admin, alice, bob, carol, treasury, outsider] = await ethers.getSigners();

  const Mock = await ethers.getContractFactory("MockV3Aggregator");
  const ethFeed = await Mock.deploy(FEED_DECIMALS, ETH_USD);
  const xauFeed = await Mock.deploy(FEED_DECIMALS, XAU_USD);

  const Token = await ethers.getContractFactory("CommodityToken");
  const token = await Token.deploy(
    admin.address,
    "https://aurum.example/{id}.json",
    await ethFeed.getAddress(),
    treasury.address,
    FEE_BPS
  );

  return { token, ethFeed, xauFeed, admin, alice, bob, carol, treasury, outsider };
}

/** A batch with inventory minted into the contract, ready to trade. */
async function seeded() {
  const base = await deploy();
  const { token, xauFeed, alice, bob } = base;

  await token.createBatch(10_000, 10, "XAU", await xauFeed.getAddress(), "LOOMIS-ZRH-0001");
  await token.mint(1, 1_000);
  await token.addToWhitelist(alice.address);
  await token.addToWhitelist(bob.address);

  return { ...base, batchId: 1n, gramsPerToken: 10 };
}

describe("CommodityToken", () => {
  /* ---------------------------------------------------------------- deploy */

  describe("deployment", () => {
    it("grants every operational role to the admin", async () => {
      const { token, admin } = await loadFixture(deploy);

      for (const role of [
        await token.DEFAULT_ADMIN_ROLE(),
        await token.COMPLIANCE_ROLE(),
        await token.ISSUER_ROLE(),
        await token.PAUSER_ROLE(),
      ]) {
        expect(await token.hasRole(role, admin.address)).to.equal(true);
      }
    });

    it("whitelists the admin and the contract itself", async () => {
      const { token, admin } = await loadFixture(deploy);
      expect(await token.isWhitelisted(admin.address)).to.equal(true);
      expect(await token.isWhitelisted(await token.getAddress())).to.equal(true);
    });

    it("reserves batch id 0 and starts issuing at 1", async () => {
      const { token } = await loadFixture(deploy);
      expect(await token.nextBatchId()).to.equal(1n);
    });

    it("stores the treasury and fee", async () => {
      const { token, treasury } = await loadFixture(deploy);
      expect(await token.treasury()).to.equal(treasury.address);
      expect(await token.royaltyFeeBps()).to.equal(FEE_BPS);
    });

    it("rejects a zero admin, feed or treasury and a fee over the cap", async () => {
      const { ethFeed, admin, treasury } = await loadFixture(deploy);
      const Token = await ethers.getContractFactory("CommodityToken");
      const feed = await ethFeed.getAddress();

      await expect(
        Token.deploy(ethers.ZeroAddress, "uri", feed, treasury.address, FEE_BPS)
      ).to.be.revertedWithCustomError(Token, "ZeroAddress");

      await expect(
        Token.deploy(admin.address, "uri", ethers.ZeroAddress, treasury.address, FEE_BPS)
      ).to.be.revertedWithCustomError(Token, "ZeroAddress");

      await expect(
        Token.deploy(admin.address, "uri", feed, ethers.ZeroAddress, FEE_BPS)
      ).to.be.revertedWithCustomError(Token, "ZeroAddress");

      await expect(
        Token.deploy(admin.address, "uri", feed, treasury.address, 1001)
      ).to.be.revertedWithCustomError(Token, "FeeTooHigh");
    });
  });

  /* ------------------------------------------------------------- whitelist */

  describe("whitelist", () => {
    it("lets compliance approve an address", async () => {
      const { token, alice, admin } = await loadFixture(deploy);

      await expect(token.addToWhitelist(alice.address))
        .to.emit(token, "AddressWhitelisted")
        .withArgs(alice.address, admin.address);

      expect(await token.isWhitelisted(alice.address)).to.equal(true);
    });

    it("refuses anyone without COMPLIANCE_ROLE", async () => {
      const { token, alice, bob } = await loadFixture(deploy);
      await expect(
        token.connect(alice).addToWhitelist(bob.address)
      ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });

    it("rejects the zero address and a double approval", async () => {
      const { token, alice } = await loadFixture(deploy);

      await expect(
        token.addToWhitelist(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(token, "ZeroAddress");

      await token.addToWhitelist(alice.address);
      await expect(token.addToWhitelist(alice.address))
        .to.be.revertedWithCustomError(token, "AlreadyWhitelisted")
        .withArgs(alice.address);
    });

    it("removes an address and refuses to remove the contract itself", async () => {
      const { token, alice } = await loadFixture(deploy);

      await token.addToWhitelist(alice.address);
      await expect(token.removeFromWhitelist(alice.address)).to.emit(
        token,
        "AddressRemovedFromWhitelist"
      );
      expect(await token.isWhitelisted(alice.address)).to.equal(false);

      await expect(
        token.removeFromWhitelist(await token.getAddress())
      ).to.be.revertedWithCustomError(token, "CannotRemoveContractSelf");
    });

    it("approves up to ten addresses at once and no more", async () => {
      const { token } = await loadFixture(deploy);

      const ten = Array.from({ length: 10 }, () => ethers.Wallet.createRandom().address);
      await token.addBatchToWhitelist(ten);
      for (const address of ten) expect(await token.isWhitelisted(address)).to.equal(true);

      await expect(token.addBatchToWhitelist([])).to.be.revertedWithCustomError(
        token,
        "EmptyWhiteListBatch"
      );

      const eleven = Array.from({ length: 11 }, () => ethers.Wallet.createRandom().address);
      await expect(token.addBatchToWhitelist(eleven))
        .to.be.revertedWithCustomError(token, "WhiteListBatchLimitExceeded")
        .withArgs(11, 10);
    });

    it("reverts the whole batch if one address is already approved", async () => {
      const { token, alice, bob } = await loadFixture(deploy);
      await token.addToWhitelist(alice.address);

      await expect(
        token.addBatchToWhitelist([bob.address, alice.address])
      ).to.be.revertedWithCustomError(token, "AlreadyWhitelisted");

      // The revert rolled back the whole call — bob was not approved either.
      expect(await token.isWhitelisted(bob.address)).to.equal(false);
    });
  });

  /* ---------------------------------------------------------------- batches */

  describe("batches", () => {
    it("creates a batch and increments the id", async () => {
      const { token, xauFeed } = await loadFixture(deploy);
      const feed = await xauFeed.getAddress();

      await expect(token.createBatch(10_000, 10, "XAU", feed, "LOOMIS-ZRH-0001"))
        .to.emit(token, "BatchCreated")
        .withArgs(1n, 10_000n, 10n, "XAU", feed, "LOOMIS-ZRH-0001");

      expect(await token.nextBatchId()).to.equal(2n);

      const details = await token.getBatchDetails(1);
      expect(details.maxSupply).to.equal(10_000n);
      expect(details.mintedSupply).to.equal(0n);
      expect(details.gramsPerToken).to.equal(10n);
      expect(details.assetSymbol).to.equal("XAU");
      expect(details.custodyReference).to.equal("LOOMIS-ZRH-0001");
      expect(details.exists).to.equal(true);
    });

    it("only lets an issuer create batches", async () => {
      const { token, xauFeed, alice } = await loadFixture(deploy);
      await expect(
        token.connect(alice).createBatch(1, 1, "XAU", await xauFeed.getAddress(), "REF")
      ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
    });

    it("validates every batch parameter", async () => {
      const { token, xauFeed } = await loadFixture(deploy);
      const feed = await xauFeed.getAddress();

      await expect(
        token.createBatch(0, 10, "XAU", feed, "REF")
      ).to.be.revertedWithCustomError(token, "MaxSupplyMustBeGreaterThanZero");

      await expect(
        token.createBatch(100, 0, "XAU", feed, "REF")
      ).to.be.revertedWithCustomError(token, "GramsPerTokenMustBeGreaterThanZero");

      await expect(token.createBatch(100, 1_000_001, "XAU", feed, "REF"))
        .to.be.revertedWithCustomError(token, "GramsPerTokenTooLarge")
        .withArgs(1_000_001, 1_000_000);

      await expect(
        token.createBatch(100, 10, "XAU", ethers.ZeroAddress, "REF")
      ).to.be.revertedWithCustomError(token, "ZeroPriceFeedAddress");

      await expect(
        token.createBatch(100, 10, "", feed, "REF")
      ).to.be.revertedWithCustomError(token, "EmptyAssetSymbol");

      await expect(
        token.createBatch(100, 10, "XAU", feed, "")
      ).to.be.revertedWithCustomError(token, "EmptyCustodyReference");
    });

    it("reads of a batch that was never created revert", async () => {
      const { token } = await loadFixture(deploy);
      await expect(token.getBatchDetails(99))
        .to.be.revertedWithCustomError(token, "BatchDoesNotExist")
        .withArgs(99);
    });

    it("mints inventory to the contract and honours the cap", async () => {
      const { token, xauFeed } = await loadFixture(deploy);
      await token.createBatch(100, 10, "XAU", await xauFeed.getAddress(), "REF");

      await expect(token.mint(1, 60)).to.emit(token, "BatchMinted");
      expect(await token.balanceOf(await token.getAddress(), 1)).to.equal(60n);

      await expect(token.mint(1, 41))
        .to.be.revertedWithCustomError(token, "ExceedsBatchSupply")
        .withArgs(41, 40);

      await expect(token.mint(1, 0)).to.be.revertedWithCustomError(
        token,
        "AmountMustBeGreaterThanZero"
      );
    });

    it("burns only from the contract's own inventory", async () => {
      const { token, xauFeed } = await loadFixture(deploy);
      await token.createBatch(100, 10, "XAU", await xauFeed.getAddress(), "REF");
      await token.mint(1, 50);

      await expect(token.burn(1, 20)).to.emit(token, "BatchBurned");
      expect(await token.balanceOf(await token.getAddress(), 1)).to.equal(30n);

      await expect(token.burn(1, 31))
        .to.be.revertedWithCustomError(token, "BurnExceedsMintedSupply")
        .withArgs(31, 30);
    });

    it("updates the custody reference and the feed, but never supply or weight", async () => {
      const { token, xauFeed, ethFeed } = await loadFixture(deploy);
      await token.createBatch(100, 10, "XAU", await xauFeed.getAddress(), "REF-1");

      await expect(token.updateCustodyReference(1, "REF-2")).to.emit(token, "BatchUpdated");
      expect((await token.getBatchDetails(1)).custodyReference).to.equal("REF-2");

      await expect(token.updatePriceFeed(1, await ethFeed.getAddress())).to.emit(
        token,
        "BatchUpdated"
      );

      await expect(
        token.updateCustodyReference(1, "")
      ).to.be.revertedWithCustomError(token, "EmptyCustodyReference");

      // There is deliberately no setter for maxSupply, gramsPerToken or symbol:
      // changing them would retroactively alter what issued tokens represent.
      expect(token.interface.fragments.some((f) => f.name === "setMaxSupply")).to.equal(false);
      expect(token.interface.fragments.some((f) => f.name === "setGramsPerToken")).to.equal(
        false
      );
    });
  });

  /* ------------------------------------------------- TRANSFER RESTRICTIONS */

  describe("transfer restrictions", () => {
    it("allows a transfer between two approved holders", async () => {
      const { token, alice, bob, batchId } = await loadFixture(seeded);
      await token.connect(alice).purchase(batchId, 2, { value: ethers.parseEther("10") });

      await token.connect(alice).safeTransferFrom(alice.address, bob.address, batchId, 1, "0x");

      expect(await token.balanceOf(alice.address, batchId)).to.equal(1n);
      expect(await token.balanceOf(bob.address, batchId)).to.equal(1n);
    });

    it("blocks a transfer to an address that is not approved", async () => {
      const { token, alice, outsider, batchId } = await loadFixture(seeded);
      await token.connect(alice).purchase(batchId, 2, { value: ethers.parseEther("10") });

      await expect(
        token.connect(alice).safeTransferFrom(alice.address, outsider.address, batchId, 1, "0x")
      )
        .to.be.revertedWithCustomError(token, "TransferNotAllowed")
        .withArgs(alice.address, outsider.address);

      expect(await token.balanceOf(outsider.address, batchId)).to.equal(0n);
    });

    it("freezes a holder's balance once approval is revoked", async () => {
      const { token, alice, bob, batchId } = await loadFixture(seeded);
      await token.connect(alice).purchase(batchId, 2, { value: ethers.parseEther("10") });

      await token.removeFromWhitelist(alice.address);

      // The tokens are still hers — the claim survives — but they cannot move.
      expect(await token.balanceOf(alice.address, batchId)).to.equal(2n);
      await expect(
        token.connect(alice).safeTransferFrom(alice.address, bob.address, batchId, 1, "0x")
      ).to.be.revertedWithCustomError(token, "TransferNotAllowed");

      // Re-approving unfreezes it.
      await token.addToWhitelist(alice.address);
      await token.connect(alice).safeTransferFrom(alice.address, bob.address, batchId, 1, "0x");
      expect(await token.balanceOf(bob.address, batchId)).to.equal(1n);
    });

    it("blocks a batch transfer to an unapproved address too", async () => {
      const { token, alice, outsider, batchId } = await loadFixture(seeded);
      await token.connect(alice).purchase(batchId, 2, { value: ethers.parseEther("10") });

      await expect(
        token
          .connect(alice)
          .safeBatchTransferFrom(alice.address, outsider.address, [batchId], [1], "0x")
      ).to.be.revertedWithCustomError(token, "TransferNotAllowed");
    });

    it("blocks an operator-approved transfer to an unapproved address", async () => {
      const { token, alice, bob, outsider, batchId } = await loadFixture(seeded);
      await token.connect(alice).purchase(batchId, 2, { value: ethers.parseEther("10") });

      // Even with ERC-1155 operator approval, the destination still has to pass.
      await token.connect(alice).setApprovalForAll(bob.address, true);
      await expect(
        token.connect(bob).safeTransferFrom(alice.address, outsider.address, batchId, 1, "0x")
      ).to.be.revertedWithCustomError(token, "TransferNotAllowed");
    });

    it("still allows minting and burning, which are not transfers between holders", async () => {
      const { token, xauFeed } = await loadFixture(deploy);
      await token.createBatch(100, 10, "XAU", await xauFeed.getAddress(), "REF");

      // from == address(0) on mint, to == address(0) on burn — both skip the check.
      await expect(token.mint(1, 10)).to.not.be.reverted;
      await expect(token.burn(1, 10)).to.not.be.reverted;
    });

    it("refuses to let an unapproved address buy in", async () => {
      const { token, outsider, batchId } = await loadFixture(seeded);
      await expect(
        token.connect(outsider).purchase(batchId, 1, { value: ethers.parseEther("10") })
      )
        .to.be.revertedWithCustomError(token, "AddressNotWhiteListed")
        .withArgs(outsider.address);
    });
  });

  /* ---------------------------------------------------------------- pricing */

  describe("pricing", () => {
    it("derives the token price from both feeds and the batch weight", async () => {
      const { token, batchId, gramsPerToken } = await loadFixture(seeded);
      expect(await token.tokenPriceInWei(batchId)).to.equal(expectedPrice(gramsPerToken));
    });

    it("scales linearly with grams per token", async () => {
      const { token, xauFeed } = await loadFixture(seeded);
      await token.createBatch(100, 25, "XAU", await xauFeed.getAddress(), "REF-25");

      const ten = await token.tokenPriceInWei(1);
      const twentyFive = await token.tokenPriceInWei(2);
      expect(twentyFive).to.equal((ten * 25n) / 10n);
    });

    it("refuses to price against a feed older than three hours", async () => {
      const { token, xauFeed, batchId } = await loadFixture(seeded);

      const now = await time.latest();
      await xauFeed.updateAnswerAt(XAU_USD, now - MAX_PRICE_AGE - 1);

      await expect(token.tokenPriceInWei(batchId)).to.be.revertedWithCustomError(
        token,
        "StaleOraclePrice"
      );
    });

    it("accepts a feed right on the freshness boundary", async () => {
      const { token, xauFeed, batchId } = await loadFixture(seeded);

      const now = await time.latest();
      await xauFeed.updateAnswerAt(XAU_USD, now - MAX_PRICE_AGE + 30);

      await expect(token.tokenPriceInWei(batchId)).to.not.be.reverted;
    });

    it("rejects a non-positive oracle answer", async () => {
      const { token, xauFeed, batchId } = await loadFixture(seeded);
      await xauFeed.updateAnswer(0);

      await expect(token.tokenPriceInWei(batchId)).to.be.revertedWithCustomError(
        token,
        "InvalidOracleAnswer"
      );
    });

    it("exposes both raw feed reads", async () => {
      const { token, batchId } = await loadFixture(seeded);

      const [gold, goldDecimals] = await token.getBatchUsdPrice(batchId);
      expect(gold).to.equal(XAU_USD);
      expect(goldDecimals).to.equal(FEED_DECIMALS);

      const [eth] = await token.getEthUsdPrice();
      expect(eth).to.equal(ETH_USD);
    });
  });

  /* --------------------------------------------------------------- purchase */

  describe("purchase", () => {
    it("moves tokens to the buyer, keeps the ETH and refunds the excess", async () => {
      const { token, alice, batchId, gramsPerToken } = await loadFixture(seeded);

      const unit = expectedPrice(gramsPerToken);
      const cost = unit * 4n;
      const fee = (cost * FEE_BPS) / 10_000n;
      const total = cost + fee;
      const sent = total + ethers.parseEther("1");

      const before = await ethers.provider.getBalance(alice.address);
      const tx = await token.connect(alice).purchase(batchId, 4, { value: sent });
      const receipt = await tx.wait();
      const gas = receipt.gasUsed * receipt.gasPrice;
      const after = await ethers.provider.getBalance(alice.address);

      expect(await token.balanceOf(alice.address, batchId)).to.equal(4n);
      // Only the total left her wallet — the extra 1 ETH came back.
      expect(before - after - gas).to.equal(total);
      expect(await ethers.provider.getBalance(await token.getAddress())).to.equal(total);

      await expect(tx)
        .to.emit(token, "BatchPurchased")
        .withArgs(batchId, alice.address, 4n, cost, fee);
    });

    it("rejects underpayment", async () => {
      const { token, alice, batchId, gramsPerToken } = await loadFixture(seeded);
      const total = (expectedPrice(gramsPerToken) * 10_250n) / 10_000n;

      await expect(
        token.connect(alice).purchase(batchId, 1, { value: total - 1n })
      ).to.be.revertedWithCustomError(token, "InsufficientPayment");
    });

    it("cannot buy more than the contract holds", async () => {
      const { token, alice, batchId } = await loadFixture(seeded);
      await expect(
        token.connect(alice).purchase(batchId, 1_001, { value: ethers.parseEther("1000") })
      )
        .to.be.revertedWithCustomError(token, "InsufficientTokensInContract")
        .withArgs(1_001, 1_000);
    });

    it("rejects a zero amount", async () => {
      const { token, alice, batchId } = await loadFixture(seeded);
      await expect(
        token.connect(alice).purchase(batchId, 0, { value: ethers.parseEther("1") })
      ).to.be.revertedWithCustomError(token, "AmountMustBeGreaterThanZero");
    });
  });

  /* ------------------------------------------------------------------- sell */

  describe("sell", () => {
    it("returns tokens to inventory and pays the net from the reserve", async () => {
      const { token, alice, admin, batchId, gramsPerToken } = await loadFixture(seeded);
      await token.connect(alice).purchase(batchId, 4, { value: ethers.parseEther("10") });

      // Top the reserve up so the payout is covered.
      await admin.sendTransaction({
        to: await token.getAddress(),
        value: ethers.parseEther("5"),
      });

      const unit = expectedPrice(gramsPerToken);
      const gross = unit * 2n;
      const fee = (gross * FEE_BPS) / 10_000n;
      const net = gross - fee;

      await expect(token.connect(alice).sell(batchId, 2, net))
        .to.emit(token, "BatchSold")
        .withArgs(batchId, alice.address, 2n, net, fee);

      expect(await token.balanceOf(alice.address, batchId)).to.equal(2n);
      expect(await token.balanceOf(await token.getAddress(), batchId)).to.equal(998n);
    });

    it("honours the seller's minimum payout", async () => {
      const { token, alice, admin, batchId, gramsPerToken } = await loadFixture(seeded);
      await token.connect(alice).purchase(batchId, 2, { value: ethers.parseEther("10") });
      await admin.sendTransaction({
        to: await token.getAddress(),
        value: ethers.parseEther("5"),
      });

      const net = expectedPrice(gramsPerToken) - (expectedPrice(gramsPerToken) * FEE_BPS) / 10_000n;

      await expect(
        token.connect(alice).sell(batchId, 1, net + 1n)
      ).to.be.revertedWithCustomError(token, "PayoutBelowMinimum");
    });

    it("reverts when the reserve cannot cover the payout", async () => {
      const { token, alice, batchId } = await loadFixture(seeded);
      await token.connect(alice).purchase(batchId, 1, { value: ethers.parseEther("10") });

      // A purchase leaves cost + fee behind, which is more than the net a sale
      // pays out — so the reserve has to be drained deliberately to reach this
      // path. That is exactly the operational risk: withdraw too much and
      // holders cannot redeem.
      await token.withdrawExcess(0);
      expect(await ethers.provider.getBalance(await token.getAddress())).to.equal(0n);

      await expect(token.connect(alice).sell(batchId, 1, 0)).to.be.revertedWithCustomError(
        token,
        "InsufficientContractBalance"
      );
    });

    it("refuses a seller who is not approved", async () => {
      const { token, outsider, batchId } = await loadFixture(seeded);
      await expect(
        token.connect(outsider).sell(batchId, 1, 0)
      ).to.be.revertedWithCustomError(token, "AddressNotWhiteListed");
    });
  });

  /* ------------------------------------------------------------------ admin */

  describe("administration", () => {
    it("caps the royalty fee at 10%", async () => {
      const { token } = await loadFixture(deploy);

      await expect(token.setRoyaltyFee(1_000)).to.emit(token, "RoyaltyFeeUpdated");
      expect(await token.royaltyFeeBps()).to.equal(1_000n);

      await expect(token.setRoyaltyFee(1_001))
        .to.be.revertedWithCustomError(token, "FeeTooHigh")
        .withArgs(1_001, 1_000);
    });

    it("changes the treasury but never to the zero address", async () => {
      const { token, alice } = await loadFixture(deploy);

      await expect(token.setTreasury(alice.address)).to.emit(token, "TreasuryUpdated");
      expect(await token.treasury()).to.equal(alice.address);

      await expect(token.setTreasury(ethers.ZeroAddress)).to.be.revertedWithCustomError(
        token,
        "ZeroAddress"
      );
    });

    it("withdraws everything above the amount it is told to keep", async () => {
      const { token, admin, treasury } = await loadFixture(deploy);
      await admin.sendTransaction({
        to: await token.getAddress(),
        value: ethers.parseEther("10"),
      });

      const keep = ethers.parseEther("4");
      const before = await ethers.provider.getBalance(treasury.address);

      await expect(token.withdrawExcess(keep))
        .to.emit(token, "ReserveWithdrawn")
        .withArgs(treasury.address, ethers.parseEther("6"), keep);

      expect(await ethers.provider.getBalance(await token.getAddress())).to.equal(keep);
      expect((await ethers.provider.getBalance(treasury.address)) - before).to.equal(
        ethers.parseEther("6")
      );

      await expect(token.withdrawExcess(keep)).to.be.revertedWithCustomError(
        token,
        "InsufficientContractBalance"
      );
    });

    it("keeps administration behind the admin role", async () => {
      const { token, alice } = await loadFixture(deploy);

      await expect(token.connect(alice).setRoyaltyFee(100)).to.be.revertedWithCustomError(
        token,
        "AccessControlUnauthorizedAccount"
      );
      await expect(
        token.connect(alice).setTreasury(alice.address)
      ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");
      await expect(token.connect(alice).withdrawExcess(0)).to.be.revertedWithCustomError(
        token,
        "AccessControlUnauthorizedAccount"
      );
    });
  });

  /* ------------------------------------------------------------------ pause */

  describe("pause", () => {
    it("stops trading, minting and transfers, and resumes cleanly", async () => {
      const { token, alice, bob, batchId } = await loadFixture(seeded);
      await token.connect(alice).purchase(batchId, 2, { value: ethers.parseEther("10") });

      await token.pause();

      await expect(
        token.connect(alice).purchase(batchId, 1, { value: ethers.parseEther("10") })
      ).to.be.revertedWithCustomError(token, "EnforcedPause");

      await expect(
        token.connect(alice).safeTransferFrom(alice.address, bob.address, batchId, 1, "0x")
      ).to.be.revertedWithCustomError(token, "EnforcedPause");

      await expect(token.mint(batchId, 1)).to.be.revertedWithCustomError(
        token,
        "EnforcedPause"
      );

      await token.unpause();
      await token.connect(alice).safeTransferFrom(alice.address, bob.address, batchId, 1, "0x");
      expect(await token.balanceOf(bob.address, batchId)).to.equal(1n);
    });

    it("leaves balances untouched while paused", async () => {
      const { token, alice, batchId } = await loadFixture(seeded);
      await token.connect(alice).purchase(batchId, 3, { value: ethers.parseEther("10") });

      await token.pause();
      expect(await token.balanceOf(alice.address, batchId)).to.equal(3n);
    });

    it("only a pauser can pause", async () => {
      const { token, alice } = await loadFixture(deploy);
      await expect(token.connect(alice).pause()).to.be.revertedWithCustomError(
        token,
        "AccessControlUnauthorizedAccount"
      );
    });
  });

  /* ----------------------------------------------------------------- ERC165 */

  describe("interfaces", () => {
    it("advertises ERC-1155, ERC-165 and AccessControl", async () => {
      const { token } = await loadFixture(deploy);
      expect(await token.supportsInterface("0xd9b67a26")).to.equal(true); // ERC1155
      expect(await token.supportsInterface("0x01ffc9a7")).to.equal(true); // ERC165
      expect(await token.supportsInterface("0x7965db0b")).to.equal(true); // AccessControl
    });
  });
});
