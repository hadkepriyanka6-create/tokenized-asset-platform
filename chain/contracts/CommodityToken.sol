// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";

/// @title CommodityToken
/// @notice Single contract managing KYC whitelisting and a multi-batch
///         ERC-1155 token for commodity-backed fractional ownership
///         (gold, silver, or any other asset with a live Chainlink feed).
contract CommodityToken is
    ERC1155,
    ERC1155Holder,
    AccessControl,
    Pausable,
    ReentrancyGuard
{
    /* -------------------------------------------------------------------------- */
    /*                                    ROLES                                   */
    /* -------------------------------------------------------------------------- */

    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /* -------------------------------------------------------------------------- */
    /*                             WHITELIST STORAGE                              */
    /* -------------------------------------------------------------------------- */

    uint256 public constant MAX_WHITELIST_BATCH_SIZE = 10;

    // Private on purpose — isWhitelisted() below is the only external read.
    mapping(address => bool) private _approvedList;

    /* -------------------------------------------------------------------------- */
    /*                               BATCH STORAGE                                */
    /* -------------------------------------------------------------------------- */

    struct BatchInfo {
        uint256 maxSupply;
        uint256 mintedSupply;
        uint256 gramsPerToken;
        string assetSymbol;
        AggregatorV3Interface priceFeed;
        string custodyReference;
        bool exists;
    }

    mapping(uint256 => BatchInfo) public batches;
    uint256 public nextBatchId;

    /* -------------------------------------------------------------------------- */
    /*                             ORACLE CONFIGURATION                           */
    /* -------------------------------------------------------------------------- */

    AggregatorV3Interface public immutable ethUsdFeed;
    uint256 public constant MAX_PRICE_AGE = 3 hours;

    // 31.1034768 grams per troy ounce, scaled by 1e7 for integer math.
    uint256 private constant TROY_OUNCE_GRAMS_SCALED_1E7 = 311034768;

    uint256 public constant MAX_GRAMS_PER_TOKEN = 1_000_000;

    /* -------------------------------------------------------------------------- */
    /*                          FEE & TREASURY CONFIGURATION                      */
    /* -------------------------------------------------------------------------- */

    /// @notice Address that receives ETH withdrawn from the reserve.
    address public treasury;

    /// @notice Royalty fee in basis points (1 bps = 0.01%).
    ///         Applied on both purchase and sell.
    uint256 public royaltyFeeBps;

    /// @notice Maximum allowed fee — 10%.
    uint256 public constant MAX_FEE_BPS = 1000;

    /* -------------------------------------------------------------------------- */
    /*                                    EVENTS                                  */
    /* -------------------------------------------------------------------------- */

    event AddressWhitelisted(
        address indexed account,
        address indexed approvedBy
    );
    event AddressRemovedFromWhitelist(
        address indexed account,
        address indexed removedBy
    );

    event BatchCreated(
        uint256 indexed id,
        uint256 maxSupply,
        uint256 gramsPerToken,
        string assetSymbol,
        address priceFeed,
        string custodyReference
    );
    event BatchUpdated(
        uint256 indexed id,
        uint256 maxSupply,
        uint256 gramsPerToken,
        string assetSymbol,
        address priceFeed,
        string custodyReference
    );
    event BatchMinted(uint256 indexed id, address indexed to, uint256 amount);
    event BatchBurned(uint256 indexed id, address indexed from, uint256 amount);

    event BatchPurchased(
        uint256 indexed id,
        address indexed buyer,
        uint256 amount,
        uint256 costWei,
        uint256 feeWei
    );
    event BatchSold(
        uint256 indexed id,
        address indexed seller,
        uint256 amount,
        uint256 payoutWei,
        uint256 feeWei
    );

    event TreasuryUpdated(
        address indexed oldTreasury,
        address indexed newTreasury
    );
    event RoyaltyFeeUpdated(uint256 oldFee, uint256 newFee);
    event ReserveWithdrawn(address indexed to, uint256 amount, uint256 kept);

    /* -------------------------------------------------------------------------- */
    /*                               CUSTOM ERRORS                                */
    /* -------------------------------------------------------------------------- */

    error ZeroAddress();
    error EmptyWhiteListBatch();
    error WhiteListBatchLimitExceeded(uint256 provided, uint256 maximum);
    error AlreadyWhitelisted(address account);
    error AddressNotWhiteListed(address account);
    error PayoutBelowMinimum(uint256 payout, uint256 minimum);
    error MaxSupplyMustBeGreaterThanZero();
    error GramsPerTokenMustBeGreaterThanZero();
    error ZeroPriceFeedAddress();
    error EmptyAssetSymbol();
    error EmptyCustodyReference();
    error BatchDoesNotExist(uint256 id);
    error AmountMustBeGreaterThanZero();
    error ExceedsBatchSupply(uint256 requested, uint256 available);
    error BurnExceedsMintedSupply(uint256 requested, uint256 available);
    error TransferNotAllowed(address from, address to);
    error InvalidOracleAnswer();
    error StaleOraclePrice();
    error InsufficientPayment(uint256 required, uint256 provided);
    error InsufficientContractBalance();
    error InsufficientTokensInContract(uint256 requested, uint256 held);
    error RefundTransferFailed();
    error SellTransferFailed();
    error WithdrawTransferFailed();
    error FeeTooHigh(uint256 provided, uint256 maximum);
    error CannotRemoveContractSelf();
    error GramsPerTokenTooLarge(uint256 provided, uint256 maximum);

    /* -------------------------------------------------------------------------- */
    /*                                 MODIFIERS                                  */
    /* -------------------------------------------------------------------------- */

    modifier onlyWhitelisted(address account) {
        if (!_approvedList[account]) revert AddressNotWhiteListed(account);
        _;
    }

    /* -------------------------------------------------------------------------- */
    /*                                 CONSTRUCTOR                                */
    /* -------------------------------------------------------------------------- */

    /// @param admin Address that receives the initial administrative roles.
    /// @param uri_ Base ERC-1155 metadata URI (should contain "{id}").
    /// @param ethUsdFeedAddress Address of the Chainlink ETH/USD price feed.
    /// @param treasury_ Address that receives ETH withdrawn from the reserve.
    /// @param royaltyFeeBps_ Initial royalty fee in basis points (e.g., 250 = 2.5%).
    constructor(
        address admin,
        string memory uri_,
        address ethUsdFeedAddress,
        address treasury_,
        uint256 royaltyFeeBps_
    ) ERC1155(uri_) {
        if (admin == address(0)) revert ZeroAddress();
        if (ethUsdFeedAddress == address(0)) revert ZeroAddress();
        if (treasury_ == address(0)) revert ZeroAddress();
        if (royaltyFeeBps_ > MAX_FEE_BPS)
            revert FeeTooHigh(royaltyFeeBps_, MAX_FEE_BPS);

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(COMPLIANCE_ROLE, admin);
        _grantRole(ISSUER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);

        ethUsdFeed = AggregatorV3Interface(ethUsdFeedAddress);
        treasury = treasury_;
        royaltyFeeBps = royaltyFeeBps_;
        nextBatchId = 1; // batch id 0 reserved

        _whitelist(admin);
        _whitelist(address(this));
    }

    /* -------------------------------------------------------------------------- */
    /*                                 RECEIVE                                    */
    /* -------------------------------------------------------------------------- */

    /// @notice Allows the admin to top up the ETH reserve.
    receive() external payable {}

    /* -------------------------------------------------------------------------- */
    /*                              EMERGENCY PAUSE                               */
    /* -------------------------------------------------------------------------- */

    /// @notice Freezes minting, burning, purchasing, selling, and transfers.
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Resumes normal operation.
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /* -------------------------------------------------------------------------- */
    /*                         INTERNAL WHITELIST FUNCTIONS                       */
    /* -------------------------------------------------------------------------- */

    function _validateWhitelistAddress(address account) internal view {
        if (account == address(0)) revert ZeroAddress();
        if (_approvedList[account]) revert AlreadyWhitelisted(account);
    }

    function _whitelist(address account) internal {
        _approvedList[account] = true;
        emit AddressWhitelisted(account, msg.sender);
    }

    function _validateRemoveAddress(address account) internal view {
        if (account == address(0)) revert ZeroAddress();
        if (!_approvedList[account]) revert AddressNotWhiteListed(account);
        if (account == address(this)) revert CannotRemoveContractSelf();
    }

    function _removeWhitelist(address account) internal {
        _approvedList[account] = false;
        emit AddressRemovedFromWhitelist(account, msg.sender);
    }

    // ------------------------------------------------------------------------
    //                          Whitelist Functions
    // ------------------------------------------------------------------------

    function addToWhitelist(
        address account
    ) external whenNotPaused onlyRole(COMPLIANCE_ROLE) {
        _validateWhitelistAddress(account);
        _whitelist(account);
    }

    function addBatchToWhitelist(
        address[] calldata accounts
    ) external whenNotPaused onlyRole(COMPLIANCE_ROLE) {
        uint256 length = accounts.length;
        if (length == 0) revert EmptyWhiteListBatch();
        if (length > MAX_WHITELIST_BATCH_SIZE) {
            revert WhiteListBatchLimitExceeded(
                length,
                MAX_WHITELIST_BATCH_SIZE
            );
        }
        for (uint256 i; i < length; ) {
            _validateWhitelistAddress(accounts[i]);
            _whitelist(accounts[i]);
            unchecked {
                ++i;
            }
        }
    }

    function removeFromWhitelist(
        address account
    ) external whenNotPaused onlyRole(COMPLIANCE_ROLE) {
        _validateRemoveAddress(account);
        _removeWhitelist(account);
    }

    function removeBatchFromWhitelist(
        address[] calldata accounts
    ) external whenNotPaused onlyRole(COMPLIANCE_ROLE) {
        uint256 length = accounts.length;
        if (length == 0) revert EmptyWhiteListBatch();
        if (length > MAX_WHITELIST_BATCH_SIZE) {
            revert WhiteListBatchLimitExceeded(
                length,
                MAX_WHITELIST_BATCH_SIZE
            );
        }
        for (uint256 i; i < length; ) {
            _validateRemoveAddress(accounts[i]);
            _removeWhitelist(accounts[i]);
            unchecked {
                ++i;
            }
        }
    }

    function isWhitelisted(address account) external view returns (bool) {
        return _approvedList[account];
    }

    /* -------------------------------------------------------------------------- */
    /*                          BATCH CREATION & MINTING                          */
    /* -------------------------------------------------------------------------- */

    function _validateBatchParams(
        uint256 maxSupply,
        uint256 gramsPerToken,
        address priceFeedAddress,
        string calldata assetSymbol,
        string calldata custodyReference
    ) internal pure {
        if (maxSupply == 0) revert MaxSupplyMustBeGreaterThanZero();
        if (gramsPerToken == 0) revert GramsPerTokenMustBeGreaterThanZero();
        if (gramsPerToken > MAX_GRAMS_PER_TOKEN)
            revert GramsPerTokenTooLarge(gramsPerToken, MAX_GRAMS_PER_TOKEN);
        if (priceFeedAddress == address(0)) revert ZeroPriceFeedAddress();
        if (bytes(assetSymbol).length == 0) revert EmptyAssetSymbol();
        if (bytes(custodyReference).length == 0) revert EmptyCustodyReference();
    }

    /// @dev Returns the batch's storage slot, reverting if it was never
    ///      created. Centralizes the existence check used across mint,
    ///      burn, purchase, update, and read functions.
    function _getExistingBatch(
        uint256 id
    ) internal view returns (BatchInfo storage batch) {
        batch = batches[id];
        if (!batch.exists) revert BatchDoesNotExist(id);
    }

    /// @notice Open a new custody batch for any commodity with a live
    ///         Chainlink USD feed. Any ISSUER_ROLE holder can call this —
    ///         not limited to a single admin. To add silver later, call
    ///         this with the XAG/USD feed and "XAG"; no redeploy needed.
    function createBatch(
        uint256 maxSupply,
        uint256 gramsPerToken,
        string calldata assetSymbol,
        address priceFeedAddress,
        string calldata custodyReference
    ) external whenNotPaused onlyRole(ISSUER_ROLE) returns (uint256 id) {
        _validateBatchParams(
            maxSupply,
            gramsPerToken,
            priceFeedAddress,
            assetSymbol,
            custodyReference
        );

        id = nextBatchId++;
        batches[id] = BatchInfo({
            maxSupply: maxSupply,
            mintedSupply: 0,
            gramsPerToken: gramsPerToken,
            assetSymbol: assetSymbol,
            priceFeed: AggregatorV3Interface(priceFeedAddress),
            custodyReference: custodyReference,
            exists: true
        });

        emit BatchCreated(
            id,
            maxSupply,
            gramsPerToken,
            assetSymbol,
            priceFeedAddress,
            custodyReference
        );
    }

    /// @dev maxSupply, gramsPerToken, and assetSymbol are intentionally
    ///      NOT updatable — changing them after tokens are minted would
    ///      retroactively alter what already-issued tokens represent.
    function updateCustodyReference(
        uint256 id,
        string calldata newReference
    ) external whenNotPaused onlyRole(ISSUER_ROLE) {
        BatchInfo storage batch = _getExistingBatch(id);
        if (bytes(newReference).length == 0) revert EmptyCustodyReference();

        batch.custodyReference = newReference;
        emit BatchUpdated(
            id,
            batch.maxSupply,
            batch.gramsPerToken,
            batch.assetSymbol,
            address(batch.priceFeed),
            batch.custodyReference
        );
    }

    function updatePriceFeed(
        uint256 id,
        address newFeedAddress
    ) external whenNotPaused onlyRole(ISSUER_ROLE) {
        BatchInfo storage batch = _getExistingBatch(id);
        if (newFeedAddress == address(0)) revert ZeroPriceFeedAddress();

        batch.priceFeed = AggregatorV3Interface(newFeedAddress);
        emit BatchUpdated(
            id,
            batch.maxSupply,
            batch.gramsPerToken,
            batch.assetSymbol,
            address(batch.priceFeed),
            batch.custodyReference
        );
    }

    function getBatchDetails(
        uint256 id
    )
        external
        view
        returns (
            uint256 maxSupply,
            uint256 mintedSupply,
            uint256 gramsPerToken,
            string memory assetSymbol,
            address priceFeed,
            string memory custodyReference,
            bool exists
        )
    {
        BatchInfo storage batch = _getExistingBatch(id);

        maxSupply = batch.maxSupply;
        mintedSupply = batch.mintedSupply;
        gramsPerToken = batch.gramsPerToken;
        assetSymbol = batch.assetSymbol;
        priceFeed = address(batch.priceFeed);
        custodyReference = batch.custodyReference;
        exists = batch.exists;
    }

    function mint(
        uint256 id,
        uint256 amount
    ) external whenNotPaused onlyRole(ISSUER_ROLE) {
        if (amount == 0) revert AmountMustBeGreaterThanZero();

        BatchInfo storage batch = _getExistingBatch(id);
        uint256 available = batch.maxSupply - batch.mintedSupply;
        if (amount > available) revert ExceedsBatchSupply(amount, available);

        batch.mintedSupply += amount;
        _mint(address(this), id, amount, "");
        emit BatchMinted(id, address(this), amount);
    }

    function burn(
        uint256 id,
        uint256 amount
    ) external whenNotPaused onlyRole(ISSUER_ROLE) {
        if (amount == 0) revert AmountMustBeGreaterThanZero();

        BatchInfo storage batch = _getExistingBatch(id);

        // Guard 1: can't burn more than was ever minted for this batch
        if (amount > batch.mintedSupply) {
            revert BurnExceedsMintedSupply(amount, batch.mintedSupply);
        }

        // Guard 2: can't burn more tokens than the contract actually holds
        // (balanceOf and mintedSupply can diverge if tokens are transferred
        //  in/out via ERC-1155 safeTransferFrom)
        uint256 held = balanceOf(address(this), id);
        if (amount > held) {
            revert InsufficientContractBalance();
        }

        batch.mintedSupply -= amount;
        _burn(address(this), id, amount);
        emit BatchBurned(id, address(this), amount);
    }

    /* -------------------------------------------------------------------------- */
    /*                             CHAINLINK ORACLE READS                         */
    /* -------------------------------------------------------------------------- */

    /// @dev Shared staleness/sanity check for any Chainlink feed read.
    function _latestPrice(
        AggregatorV3Interface feed
    ) internal view returns (int256 price, uint8 decimals_) {
        (, int256 answer, , uint256 updatedAt, ) = feed.latestRoundData();
        if (answer <= 0) revert InvalidOracleAnswer();
        if (block.timestamp - updatedAt > MAX_PRICE_AGE)
            revert StaleOraclePrice();
        price = answer;
        decimals_ = feed.decimals();
    }

    /// @dev Normalizes a raw oracle answer to 18-decimal fixed point.
    function _normalizeTo18(
        int256 price,
        uint8 decimals_
    ) internal pure returns (uint256) {
        return uint256(price) * (10 ** (18 - decimals_));
    }

    /// @notice Returns the batch's asset price in USD from its Chainlink feed.
    function getBatchUsdPrice(
        uint256 id
    ) public view returns (int256 price, uint8 decimals_) {
        BatchInfo storage batch = _getExistingBatch(id);
        return _latestPrice(batch.priceFeed);
    }

    /// @notice Returns the current ETH/USD price from the shared Chainlink feed.
    function getEthUsdPrice()
        public
        view
        returns (int256 price, uint8 decimals_)
    {
        return _latestPrice(ethUsdFeed);
    }

    /* -------------------------------------------------------------------------- */
    /*                             TOKEN PRICING                                  */
    /* -------------------------------------------------------------------------- */

    /// @notice Price of one token unit of a batch, in wei, derived live
    ///         from that batch's USD feed and the shared ETH/USD feed.
    function tokenPriceInWei(
        uint256 id
    ) public view returns (uint256 weiPerToken) {
        BatchInfo storage batch = _getExistingBatch(id);

        (int256 assetUsd, uint8 assetDecimals) = _latestPrice(batch.priceFeed);
        (int256 ethUsd, uint8 ethDecimals) = getEthUsdPrice();

        uint256 assetUsd18 = _normalizeTo18(assetUsd, assetDecimals);
        uint256 ethUsd18 = _normalizeTo18(ethUsd, ethDecimals);

        // USD value of one token = price-per-gram × gramsPerToken
        uint256 tokenUsd18 = Math.mulDiv(
            assetUsd18 * batch.gramsPerToken,
            1e7,
            TROY_OUNCE_GRAMS_SCALED_1E7
        );
        // Convert USD value to wei using the ETH/USD feed
        weiPerToken = Math.mulDiv(tokenUsd18, 1e18, ethUsd18);
    }

    /* -------------------------------------------------------------------------- */
    /*                          PURCHASE & SELL FLOW                              */
    /* -------------------------------------------------------------------------- */

    /// @notice Buy tokens from the contract's inventory by sending ETH.
    ///         All ETH (cost + fee) stays in the contract as reserve.
    ///         Any excess msg.value is refunded to the buyer.
    /// @param id   The batch id to purchase tokens from.
    /// @param amount Number of tokens to buy.
    function purchase(
        uint256 id,
        uint256 amount
    ) external payable whenNotPaused nonReentrant onlyWhitelisted(msg.sender) {
        if (amount == 0) revert AmountMustBeGreaterThanZero();

        // Check contract has enough tokens to sell
        uint256 held = balanceOf(address(this), id);
        if (amount > held) revert InsufficientTokensInContract(amount, held);

        // Calculate cost and fee
        uint256 weiPerToken = tokenPriceInWei(id);
        uint256 cost = amount * weiPerToken;
        uint256 fee = (cost * royaltyFeeBps) / 10_000;
        uint256 totalRequired = cost + fee;

        if (msg.value < totalRequired)
            revert InsufficientPayment(totalRequired, msg.value);

        // Transfer tokens from contract to buyer
        _safeTransferFrom(address(this), msg.sender, id, amount, "");

        emit BatchPurchased(id, msg.sender, amount, cost, fee);

        // Refund excess ETH
        uint256 refund = msg.value - totalRequired;
        if (refund > 0) {
            (bool sent, ) = msg.sender.call{value: refund}("");
            if (!sent) revert RefundTransferFailed();
        }
    }

    /// @notice Sell tokens back to the contract for ETH. The contract
    ///         pays out the token value minus the royalty fee from its
    ///         ETH reserve.
    /// @param id   The batch id of the tokens to sell.
    /// @param amount Number of tokens to sell back.
    /// @param minPayoutWei The minimum net ETH (after fee) the seller will
    ///        accept. Reverts if the live price yields less. Protects the
    ///        seller against price movement between signing and execution.
    function sell(
        uint256 id,
        uint256 amount,
        uint256 minPayoutWei
    ) external whenNotPaused nonReentrant onlyWhitelisted(msg.sender) {
        if (amount == 0) revert AmountMustBeGreaterThanZero();

        // Calculate payout and fee (also validates the batch exists)
        uint256 weiPerToken = tokenPriceInWei(id);
        uint256 grossPayout = amount * weiPerToken;
        uint256 fee = (grossPayout * royaltyFeeBps) / 10_000;
        uint256 netPayout = grossPayout - fee;

        // Slippage guard: revert if price moved against the seller
        if (netPayout < minPayoutWei)
            revert PayoutBelowMinimum(netPayout, minPayoutWei);

        // Solvency guard: contract must hold enough ETH to pay
        if (address(this).balance < netPayout)
            revert InsufficientContractBalance();

        // Transfer tokens from seller to contract
        _safeTransferFrom(msg.sender, address(this), id, amount, "");

        emit BatchSold(id, msg.sender, amount, netPayout, fee);

        // Send ETH to seller
        (bool sent, ) = msg.sender.call{value: netPayout}("");
        if (!sent) revert SellTransferFailed();
    }

    /* -------------------------------------------------------------------------- */
    /*                          ADMIN RESERVE MANAGEMENT                          */
    /* -------------------------------------------------------------------------- */

    /// @notice Withdraw ETH from the contract reserve to the treasury.
    /// @param keepAmount How much ETH (in wei) to keep in the contract.
    ///        Everything above this amount is sent to the treasury.
    function withdrawExcess(
        uint256 keepAmount
    ) external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 balance = address(this).balance;
        if (balance <= keepAmount) revert InsufficientContractBalance();

        uint256 withdrawAmount = balance - keepAmount;

        emit ReserveWithdrawn(treasury, withdrawAmount, keepAmount);

        (bool sent, ) = payable(treasury).call{value: withdrawAmount}("");
        if (!sent) revert WithdrawTransferFailed();
    }

    /// @notice Updates where withdrawn ETH is sent.
    function setTreasury(
        address newTreasury
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newTreasury == address(0)) revert ZeroAddress();
        emit TreasuryUpdated(treasury, newTreasury);
        treasury = newTreasury;
    }

    /// @notice Updates the royalty fee (in basis points).
    /// @param newFeeBps New fee, capped at MAX_FEE_BPS (1000 = 10%).
    function setRoyaltyFee(
        uint256 newFeeBps
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh(newFeeBps, MAX_FEE_BPS);
        emit RoyaltyFeeUpdated(royaltyFeeBps, newFeeBps);
        royaltyFeeBps = newFeeBps;
    }

    /* -------------------------------------------------------------------------- */
    /*                     Restrict Transfer of Tokens                            */
    /* -------------------------------------------------------------------------- */

    function _update(
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory values
    ) internal override whenNotPaused {
        // address(0) = mint (from) or burn (to), skip whitelist check for those
        if (from != address(0) && !_approvedList[from])
            revert TransferNotAllowed(from, to);
        if (to != address(0) && !_approvedList[to])
            revert TransferNotAllowed(from, to);
        super._update(from, to, ids, values);
    }

    /* -------------------------------------------------------------------------- */
    /*                             ERC-165 SUPPORT                                */
    /* -------------------------------------------------------------------------- */

    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        override(ERC1155, AccessControl, ERC1155Holder)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
