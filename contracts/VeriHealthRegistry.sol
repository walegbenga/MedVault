// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title VeriHealthRegistry
 * @author VeriHealth
 * @notice Patient-controlled health record registry on Base.
 *         Records are stored as IPFS CIDs + keccak256 content hashes.
 *         Access is granted/revoked per-grantee with on-chain key envelopes.
 *         Records support versioning — updates create new versions on-chain.
 *         Emergency access via pre-designated emergency wallet.
 *         Delegated uploading via pre-approved delegate wallets.
 */
contract VeriHealthRegistry {

    address public owner;

    // ─── Emergency Access ────────────────────────────────────────────────────
    address public emergencyContact;
    bool    public emergencyActive;
    uint256 public emergencyActivatedAt;

    // ─── Delegates ───────────────────────────────────────────────────────────
    mapping(address => bool) public delegates;
    address[] public delegateList;

    struct Record {
        bytes32 contentHash;
        string  ipfsCid;
        string  recordType;
        string  title;
        uint256 timestamp;
        bool    active;
        uint256 version;
        bytes32 previousId;
        address uploadedBy;  // patient or delegate
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
    mapping(address => mapping(bytes32 => KeyEnvelope)) public keyEnvelopes;
    mapping(bytes32 => bytes32)                         public latestVersion;

    // ─── Events ──────────────────────────────────────────────────────────────

    event RecordAdded(
        bytes32 indexed id,
        string  ipfsCid,
        string  recordType,
        string  title,
        uint256 timestamp,
        uint256 version,
        bytes32 previousId
    );
    event RecordRemoved(bytes32 indexed id);
    event AccessGranted(
        uint256 indexed grantId,
        address indexed grantee,
        bytes32[]       recordIds,
        uint256         expiresAt
    );
    event AccessRevoked(uint256 indexed grantId, address indexed grantee);
    event EmergencyContactSet(address indexed contact);
    event EmergencyActivated(address indexed activatedBy, uint256 timestamp);
    event EmergencyDeactivated(uint256 timestamp);
    event DelegateAdded(address indexed delegate);
    event DelegateRemoved(address indexed delegate);
    event DelegateKeyEnvelopeSet(address indexed delegate);

    // ─── Modifiers ───────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "VeriHealth: caller is not owner");
        _;
    }

    modifier onlyOwnerOrDelegate() {
        require(
            msg.sender == owner || delegates[msg.sender],
            "VeriHealth: caller is not owner or delegate"
        );
        _;
    }

    modifier onlyOwnerOrEmergency() {
        require(
            msg.sender == owner ||
            (msg.sender == emergencyContact && emergencyActive),
            "VeriHealth: not authorized"
        );
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // ─── Emergency Access ────────────────────────────────────────────────────

    function setEmergencyContact(address contact) external onlyOwner {
        require(contact != address(0), "VeriHealth: zero address");
        emergencyContact = contact;
        emit EmergencyContactSet(contact);
    }

    function activateEmergency() external {
        require(msg.sender == emergencyContact, "VeriHealth: not emergency contact");
        require(!emergencyActive, "VeriHealth: already active");
        require(emergencyContact != address(0), "VeriHealth: no emergency contact set");
        emergencyActive       = true;
        emergencyActivatedAt  = block.timestamp;
        emit EmergencyActivated(msg.sender, block.timestamp);
    }

    function deactivateEmergency() external onlyOwner {
        require(emergencyActive, "VeriHealth: not active");
        emergencyActive = false;
        emit EmergencyDeactivated(block.timestamp);
    }

    // ─── Delegates ───────────────────────────────────────────────────────────

    function addDelegate(address delegate) external onlyOwner {
        require(delegate != address(0), "VeriHealth: zero address");
        require(!delegates[delegate],   "VeriHealth: already a delegate");
        delegates[delegate] = true;
        delegateList.push(delegate);
        emit DelegateAdded(delegate);
    }

    function removeDelegate(address delegate) external onlyOwner {
        require(delegates[delegate], "VeriHealth: not a delegate");
        delegates[delegate] = false;
        for (uint256 i = 0; i < delegateList.length; i++) {
            if (delegateList[i] == delegate) {
                delegateList[i] = delegateList[delegateList.length - 1];
                delegateList.pop();
                break;
            }
        }
        emit DelegateRemoved(delegate);
    }

    function getDelegates() external view returns (address[] memory) {
        return delegateList;
    }

    // ─── Records ─────────────────────────────────────────────────────────────

    function addRecord(
        bytes32         id,
        string calldata cid,
        string calldata rType,
        string calldata title
    ) external onlyOwnerOrDelegate {
        require(!records[id].active, "VeriHealth: record already exists");
        records[id] = Record({
            contentHash: id,
            ipfsCid:     cid,
            recordType:  rType,
            title:       title,
            timestamp:   block.timestamp,
            active:      true,
            version:     1,
            previousId:  bytes32(0),
            uploadedBy:  msg.sender
        });
        recordIds.push(id);
        latestVersion[id] = id;
        emit RecordAdded(id, cid, rType, title, block.timestamp, 1, bytes32(0));
    }

    function updateRecord(
        bytes32         previousId,
        bytes32         newId,
        string calldata newCid,
        string calldata rType,
        string calldata title
    ) external onlyOwnerOrDelegate {
        require(records[previousId].active, "VeriHealth: previous record not found");
        require(!records[newId].active,     "VeriHealth: new record already exists");

        uint256 newVersion        = records[previousId].version + 1;
        records[previousId].active = false;

        records[newId] = Record({
            contentHash: newId,
            ipfsCid:     newCid,
            recordType:  rType,
            title:       title,
            timestamp:   block.timestamp,
            active:      true,
            version:     newVersion,
            previousId:  previousId,
            uploadedBy:  msg.sender
        });
        recordIds.push(newId);

        bytes32 root        = _findRoot(previousId);
        latestVersion[root] = newId;

        emit RecordAdded(newId, newCid, rType, title, block.timestamp, newVersion, previousId);
    }

    function removeRecord(bytes32 id) external onlyOwner {
        require(records[id].active, "VeriHealth: record not found");
        records[id].active = false;
        emit RecordRemoved(id);
    }

    function _findRoot(bytes32 id) internal view returns (bytes32) {
        bytes32 current = id;
        while (records[current].previousId != bytes32(0)) {
            current = records[current].previousId;
        }
        return current;
    }

    function getVersionHistory(bytes32 id)
        external view returns (bytes32[] memory ids, uint256[] memory versions)
    {
        bytes32 root  = _findRoot(id);
        uint256 count = 0;
        for (uint256 i = 0; i < recordIds.length; i++) {
            if (_findRoot(recordIds[i]) == root) count++;
        }
        ids      = new bytes32[](count);
        versions = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < recordIds.length; i++) {
            bytes32 rid = recordIds[i];
            if (_findRoot(rid) == root) {
                ids[idx]      = rid;
                versions[idx] = records[rid].version;
                idx++;
            }
        }
    }

    // ─── Access Control ──────────────────────────────────────────────────────

    function grantAccess(
        address            grantee,
        bytes32[] calldata rIds,
        uint256            expiresAt,
        string[]  calldata ciphertexts,
        string[]  calldata ivs
    ) external onlyOwner returns (uint256 grantId) {
        require(grantee != address(0),             "VeriHealth: zero address");
        require(rIds.length > 0,                   "VeriHealth: no records");
        require(rIds.length == ciphertexts.length, "VeriHealth: length mismatch");
        require(rIds.length == ivs.length,         "VeriHealth: length mismatch");

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

    function revokeAccess(uint256 grantId) external onlyOwner {
        require(grants[grantId].active, "VeriHealth: grant not active");
        AccessGrant storage g = grants[grantId];
        for (uint256 i = 0; i < g.recordIds.length; i++) {
            delete keyEnvelopes[g.grantee][g.recordIds[i]];
        }
        address grantee = g.grantee;
        g.active        = false;
        emit AccessRevoked(grantId, grantee);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function canAccess(address grantee, bytes32 recordId)
        external view returns (bool)
    {
        // Emergency contact can access all records when emergency is active
        if (grantee == emergencyContact && emergencyActive) return true;

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

    function getKeyEnvelope(address grantee, bytes32 recordId)
        external view returns (string memory ciphertext, string memory iv, bool exists)
    {
        KeyEnvelope storage e = keyEnvelopes[grantee][recordId];
        return (e.ciphertext, e.iv, e.exists);
    }

    function accessibleRecords(address grantee)
        external view returns (bytes32[] memory)
    {
        // Emergency contact sees all active records
        if (grantee == emergencyContact && emergencyActive) {
            uint256 count = 0;
            for (uint256 i = 0; i < recordIds.length; i++) {
                if (records[recordIds[i]].active) count++;
            }
            bytes32[] memory all = new bytes32[](count);
            uint256 idx = 0;
            for (uint256 i = 0; i < recordIds.length; i++) {
                if (records[recordIds[i]].active) all[idx++] = recordIds[i];
            }
            return all;
        }

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

    // delegate → patient AES key envelope
mapping(address => KeyEnvelope) public delegateKeyEnvelopes;

/// @notice Store encrypted AES key envelope for a delegate
function setDelegateKeyEnvelope(
    address         delegate,
    string calldata ciphertext,
    string calldata iv
) external onlyOwner {
    require(delegates[delegate], "VeriHealth: not a delegate");
    delegateKeyEnvelopes[delegate] = KeyEnvelope({
        ciphertext: ciphertext,
        iv:         iv,
        exists:     true
    });
    emit DelegateKeyEnvelopeSet(delegate);
}

/// @notice Get the key envelope for a delegate
function getDelegateKeyEnvelope(address delegate)
    external view returns (string memory ciphertext, string memory iv, bool exists)
{
    KeyEnvelope storage e = delegateKeyEnvelopes[delegate];
    return (e.ciphertext, e.iv, e.exists);
}
}