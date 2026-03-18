// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MedVaultRegistry
 * @author MedVault
 * @notice Patient-controlled health record registry on Base.
 *         Patients deploy their own instance of this contract.
 *         Records are stored as IPFS CIDs + keccak256 content hashes.
 *         Access is granted/revoked per-grantee, per-record, with optional expiry.
 *
 * Deploy: forge create --rpc-url https://mainnet.base.org --private-key <KEY> contracts/MedVaultRegistry.sol:MedVaultRegistry
 * Verify: forge verify-contract <ADDR> contracts/MedVaultRegistry.sol:MedVaultRegistry --chain 8453 --etherscan-api-key <KEY>
 */
contract MedVaultRegistry {

    // ─── State ───────────────────────────────────────────────────────────────

    address public owner;

    struct Record {
        bytes32 contentHash;   // keccak256 of the encrypted IPFS payload
        string  ipfsCid;       // IPFS CID of the encrypted blob
        string  recordType;    // e.g. "Lab Results"
        string  title;         // e.g. "Blood Panel Q4-2024"
        uint256 timestamp;     // block.timestamp at upload
        bool    active;        // false = soft-deleted
    }

    struct AccessGrant {
        address  grantee;
        bytes32[] recordIds;   // which record hashes are accessible
        uint256  expiresAt;    // unix timestamp; 0 = no expiry
        bool     active;
    }

    // recordId (== contentHash / bytes32) → Record
    mapping(bytes32 => Record) public records;

    // Ordered list of all record IDs (including deleted ones)
    bytes32[] public recordIds;

    // grantIndex → AccessGrant
    mapping(uint256 => AccessGrant) public grants;
    uint256 public grantCount;

    // ─── Events ──────────────────────────────────────────────────────────────

    event RecordAdded(
        bytes32 indexed id,
        string  ipfsCid,
        string  recordType,
        string  title,
        uint256 timestamp
    );

    event RecordRemoved(bytes32 indexed id);

    event AccessGranted(
        uint256 indexed grantId,
        address indexed grantee,
        bytes32[]       recordIds,
        uint256         expiresAt
    );

    event AccessRevoked(
        uint256 indexed grantId,
        address indexed grantee
    );

    // ─── Modifiers ───────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "MedVault: caller is not owner");
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
    }

    // ─── Record Management ───────────────────────────────────────────────────

    /**
     * @notice Anchor an encrypted health record on-chain.
     * @param id          keccak256 hash of the encrypted IPFS payload (acts as record ID)
     * @param cid         IPFS CID of the encrypted blob
     * @param rType       Record type string (e.g. "Lab Results")
     * @param title       Human-readable title
     */
    function addRecord(
        bytes32       id,
        string calldata cid,
        string calldata rType,
        string calldata title
    ) external onlyOwner {
        require(!records[id].active, "MedVault: record already exists");
        records[id] = Record({
            contentHash: id,
            ipfsCid:     cid,
            recordType:  rType,
            title:       title,
            timestamp:   block.timestamp,
            active:      true
        });
        recordIds.push(id);
        emit RecordAdded(id, cid, rType, title, block.timestamp);
    }

    /**
     * @notice Soft-delete a record (marks inactive, does not erase history).
     * @param id  Record ID to remove
     */
    function removeRecord(bytes32 id) external onlyOwner {
        require(records[id].active, "MedVault: record not found or already removed");
        records[id].active = false;
        emit RecordRemoved(id);
    }

    // ─── Access Control ──────────────────────────────────────────────────────

    /**
     * @notice Grant a wallet address access to a specific set of records.
     * @param grantee    Address receiving access
     * @param rIds       Array of record IDs (bytes32) to share
     * @param expiresAt  Unix timestamp after which the grant is invalid; 0 = permanent
     * @return grantId   Index of the created grant
     */
    function grantAccess(
        address          grantee,
        bytes32[] calldata rIds,
        uint256          expiresAt
    ) external onlyOwner returns (uint256 grantId) {
        require(grantee != address(0), "MedVault: zero address");
        require(rIds.length > 0,       "MedVault: no records specified");

        grantId = grantCount++;
        grants[grantId] = AccessGrant({
            grantee:   grantee,
            recordIds: rIds,
            expiresAt: expiresAt,
            active:    true
        });
        emit AccessGranted(grantId, grantee, rIds, expiresAt);
    }

    /**
     * @notice Revoke an existing access grant.
     * @param grantId  Index of the grant to revoke
     */
    function revokeAccess(uint256 grantId) external onlyOwner {
        require(grants[grantId].active, "MedVault: grant not active");
        address grantee = grants[grantId].grantee;
        grants[grantId].active = false;
        emit AccessRevoked(grantId, grantee);
    }

    // ─── View Helpers ────────────────────────────────────────────────────────

    /**
     * @notice Check whether a grantee currently has access to a specific record.
     * @param grantee   Address to check
     * @param recordId  Record ID (bytes32 content hash)
     */
    function canAccess(address grantee, bytes32 recordId)
        external view returns (bool)
    {
        for (uint256 i = 0; i < grantCount; i++) {
            AccessGrant storage g = grants[i];
            if (!g.active)              continue;
            if (g.grantee != grantee)   continue;
            if (g.expiresAt > 0 && block.timestamp > g.expiresAt) continue;
            for (uint256 j = 0; j < g.recordIds.length; j++) {
                if (g.recordIds[j] == recordId) return true;
            }
        }
        return false;
    }

    /**
     * @notice Return all record IDs that a grantee currently has access to.
     * @param grantee  Address to query
     */
    function accessibleRecords(address grantee)
        external view returns (bytes32[] memory)
    {
        // First pass: count
        uint256 count = 0;
        for (uint256 i = 0; i < grantCount; i++) {
            AccessGrant storage g = grants[i];
            if (!g.active)            continue;
            if (g.grantee != grantee) continue;
            if (g.expiresAt > 0 && block.timestamp > g.expiresAt) continue;
            count += g.recordIds.length;
        }
        // Second pass: fill
        bytes32[] memory result = new bytes32[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < grantCount; i++) {
            AccessGrant storage g = grants[i];
            if (!g.active)            continue;
            if (g.grantee != grantee) continue;
            if (g.expiresAt > 0 && block.timestamp > g.expiresAt) continue;
            for (uint256 j = 0; j < g.recordIds.length; j++) {
                result[idx++] = g.recordIds[j];
            }
        }
        return result;
    }

    /// @notice Total number of records ever added (including removed).
    function getRecordCount() external view returns (uint256) {
        return recordIds.length;
    }

    /// @notice Total number of grants ever created (including revoked).
    function getGrantCount() external view returns (uint256) {
        return grantCount;
    }

    /**
     * @notice Paginated record ID list (for front-end queries).
     * @param offset  Start index
     * @param limit   Max records to return
     */
    function getRecordIds(uint256 offset, uint256 limit)
        external view returns (bytes32[] memory)
    {
        uint256 end = offset + limit;
        if (end > recordIds.length) end = recordIds.length;
        bytes32[] memory page = new bytes32[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = recordIds[i];
        }
        return page;
    }

    /**
     * @notice Return a grant's record ID array (mapping doesn't expose dynamic arrays).
     * @param grantId  Grant index
     */
    function getGrantRecordIds(uint256 grantId)
        external view returns (bytes32[] memory)
    {
        return grants[grantId].recordIds;
    }
}
