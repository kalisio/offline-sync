# Feathers Offline Capabilities

```mermaid
graph TD
  FA[Feathers API] -->|Events| SN[Snapshot Server]
  SN <-->|Syncs| AS[Sync Server]
  C1[Client] -->|Creates Snapshot| SN
  AS <-->|Syncs| C1
  SN --> |Updates| FA
```
