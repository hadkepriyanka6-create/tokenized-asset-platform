// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MockV3Aggregator
/// @notice A Chainlink AggregatorV3Interface stand-in for tests. It lets a
///         test set the answer and, crucially, the `updatedAt` timestamp —
///         which is how the staleness path in CommodityToken is exercised
///         without waiting three hours.
contract MockV3Aggregator {
    uint8 public decimals;
    int256 public latestAnswer;
    uint256 public latestTimestamp;
    uint80 public latestRound;

    constructor(uint8 decimals_, int256 initialAnswer) {
        decimals = decimals_;
        _update(initialAnswer, block.timestamp);
    }

    function description() external pure returns (string memory) {
        return "Mock v3 Aggregator";
    }

    function version() external pure returns (uint256) {
        return 0;
    }

    function updateAnswer(int256 answer) external {
        _update(answer, block.timestamp);
    }

    /// @notice Backdates the round so `block.timestamp - updatedAt` exceeds
    ///         MAX_PRICE_AGE and the contract reverts with StaleOraclePrice.
    function updateAnswerAt(int256 answer, uint256 updatedAt) external {
        _update(answer, updatedAt);
    }

    function _update(int256 answer, uint256 updatedAt) internal {
        latestRound += 1;
        latestAnswer = answer;
        latestTimestamp = updatedAt;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (
            latestRound,
            latestAnswer,
            latestTimestamp,
            latestTimestamp,
            latestRound
        );
    }

    function getRoundData(
        uint80 roundId_
    )
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (
            roundId_,
            latestAnswer,
            latestTimestamp,
            latestTimestamp,
            roundId_
        );
    }
}
