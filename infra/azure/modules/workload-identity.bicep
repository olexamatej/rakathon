// Workload identity for the transfer-api Kubernetes service account
// (pillgaze-dev/transfer-api) with read-only Key Vault access through the
// CSI provider. Docs: https://learn.microsoft.com/en-us/azure/aks/workload-identity-deploy-cluster
targetScope = 'resourceGroup'

param location string
param identityName string
@description('OIDC issuer URL of the AKS cluster (aks module output).')
param aksOidcIssuerUrl string
@description('Key Vault used by the CSI Token binding; resource id, not URI.')
param keyVaultName string

resource uami 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
}

resource fic 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: uami
  name: 'aks-workload'
  properties: {
    issuer: aksOidcIssuerUrl
    subject: 'system:serviceaccount:pillgaze-dev:transfer-api'
    audiences: [
      'api://AzureADTokenExchange'
    ]
  }
}

// Read-only access to Key Vault secrets for the workload identity.
resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource kvSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, uami.id, 'kv-secrets-user')
  scope: vault
  properties: {
    // 'Key Vault Secrets User'
    roleDefinitionId: resourceId('Microsoft.Authorization/roleDefinitions', '463345b9-5383-4e38-a986-3418f94fdc4d')
    principalId: uami.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

output clientId string = uami.properties.clientId
output principalId string = uami.properties.principalId
