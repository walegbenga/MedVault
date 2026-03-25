// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MedVaultRegistry
 * @author MedVault
 * @notice Patient-controlled health record registry on Base.
 *         Key envelopes are stored on-chain per grantee per record.
 *         No IPFS mutation required on grant — fully decentralized.
 */
contract MedVaultRegistry {

    // ─── State ───────────────────────────────────────────────────────────────

    address public owner;

    struct Record {
        bytes32 contentHash;
        string  ipfsCid;
        string  recordType;
        string  title;
        uint256 timestamp;
        bool    active;
    }

    struct KeyEnvelope {
        string ciphertext;
        string iv;
        bool   exists;
    }

    struct AccessGrant {
        address   grantee;
        bytes32[] recordIds;
        uint256   expiresAt;
        bool      active;
    }

    mapping(bytes32 => Record)                          public records;
    bytes32[]                                           public recordIds;
    mapping(uint256 => AccessGrant)                     public grants;
    uint256                                             public grantCount;

    // grantee → recordId → encrypted AES key envelope
    mapping(address => mapping(bytes32 => KeyEnvelope)) public keyEnvelopes;

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
    event AccessRevoked(uint256 indexed grantId, address indexed grantee);

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

    function addRecord(
        bytes32         id,
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

    function removeRecord(bytes32 id) external onlyOwner {
        require(records[id].active, "MedVault: record not found");
        records[id].active = false;
        emit RecordRemoved(id);
    }

    // ─── Access Control ──────────────────────────────────────────────────────

    /**
     * @notice Grant access and store encrypted AES key envelopes on-chain.
     * @param grantee      Wallet receiving access
     * @param rIds         Record IDs to share
     * @param expiresAt    Unix expiry timestamp; 0 = permanent
     * @param ciphertexts  AES key ciphertext per record (same order as rIds)
     * @param ivs          AES key IV per record (same order as rIds)
     */
    function grantAccess(
        address            grantee,
        bytes32[] calldata rIds,
        uint256            expiresAt,
        string[]  calldata ciphertexts,
        string[]  calldata ivs
    ) external onlyOwner returns (uint256 grantId) {
        require(grantee != address(0),             "MedVault: zero address");
        require(rIds.length > 0,                   "MedVault: no records");
        require(rIds.length == ciphertexts.length, "MedVault: length mismatch");
        require(rIds.length == ivs.length,         "MedVault: length mismatch");

        for (uint256 i = 0; i < rIds.length; i++) {
            keyEnvelopes[grantee][rIds[i]] = KeyEnvelope({
                ciphertext: ciphertexts[i],
                iv:         ivs[i],
                exists:     true
            });
        }

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
     * @notice Revoke access and delete all key envelopes for this grant.
     */
    function revokeAccess(uint256 grantId) external onlyOwner {
        require(grants[grantId].active, "MedVault: grant not active");
        AccessGrant storage g = grants[grantId];
        for (uint256 i = 0; i < g.recordIds.length; i++) {
            delete keyEnvelopes[g.grantee][g.recordIds[i]];
        }
        address grantee = g.grantee;
        g.active = false;
        emit AccessRevoked(grantId, grantee);
    }

    // ─── View Helpers ────────────────────────────────────────────────────────

    function canAccess(address grantee, bytes32 recordId)
        external view returns (bool)
    {
        for (uint256 i = 0; i < grantCount; i++) {
            AccessGrant storage g = grants[i];
            if (!g.active)            continue;
            if (g.grantee != grantee) continue;
            if (g.expiresAt > 0 && block.timestamp > g.expiresAt) continue;
            for (uint256 j = 0; j < g.recordIds.length; j++) {
                if (g.recordIds[j] == recordId) return true;
            }
        }
        return false;
    }

    /**
     * @notice Get the encrypted AES key envelope for a grantee + record.
     */
    function getKeyEnvelope(address grantee, bytes32 recordId)
        external view returns (string memory ciphertext, string memory iv, bool exists)
    {
        KeyEnvelope storage e = keyEnvelopes[grantee][recordId];
        return (e.ciphertext, e.iv, e.exists);
    }

    function accessibleRecords(address grantee)
        external view returns (bytes32[] memory)
    {
        uint256 count = 0;
        for (uint256 i = 0; i < grantCount; i++) {
            AccessGrant storage g = grants[i];
            if (!g.active)            continue;
            if (g.grantee != grantee) continue;
            if (g.expiresAt > 0 && block.timestamp > g.expiresAt) continue;
            count += g.recordIds.length;
        }
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

    function getRecordCount() external view returns (uint256) {
        return recordIds.length;
    }

    function getGrantCount() external view returns (uint256) {
        return grantCount;
    }

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

    function getGrantRecordIds(uint256 grantId)
        external view returns (bytes32[] memory)
    {
        return grants[grantId].recordIds;
    }
}