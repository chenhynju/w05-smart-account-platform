// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;
/// @notice Local acceptance target. Never represents a customer protocol integration.
contract Counter {
    uint256 public number;
    event Incremented(address indexed sender, uint256 amount, uint256 value);
    function increment(uint256 amount) external payable { number += amount; emit Incremented(msg.sender, amount, msg.value); }
    function fail() external pure { revert("INTENTIONAL_FAILURE"); }
}
