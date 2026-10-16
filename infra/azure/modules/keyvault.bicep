// Azure Key Vault holding the transfer API HMAC pepper and (when enabled)
// the PostgreSQL password. Never write secret values into this template —
// provision.sh adds them at runtime with az keyvault secret set.
targetScope = 'resourceGroup'

param location string
param keyVaultName string

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    // RBAC authorization: least privilege — assign 'Key Vault Secrets User'
    // to the workload identity in modules/workload-identity.bicep.
    enableRbacAuthorization: true
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
      // Key Vault CSI Token exchange is public keys only; no special
      // network ACL needed on a dev cluster until the VNet work.
      ipRules: []
      virtualNetworkRules: []
    }
    softDeleteRetentionInDays: 7
  }
}

// Least privilege: the workload identity receives 'Key Vault Secrets User'
// via RBAC assigned in modules/workload-identity.bicep.

output name string = vault.name
output resourceUri string = vault.properties.vaultUri
output id string = vault.id
