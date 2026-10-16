// User-assigned managed identity + Azure AD federated credential that lets
// GitHub Actions on the CI/CD flow push images to ACR without any stored
// secret or kubeconfig.
// Reference: docs  https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation
targetScope = 'resourceGroup'

param location string
param identityName string
@description('ACR registry name; the push identity gets Contributor and Data Contributor scopes.')
param acrName string
param githubRepository string
param gitopsRef string

resource uami 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: identityName
  location: location
}

resource fic 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: uami
  name: 'github-oidc'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    // Least privilege: only the deployment branch of the deployed repo,
    // only a push to ACR.
    subject: 'repo:${githubRepository}:ref:refs/heads/${gitopsRef}'
    audiences: [
      'api://AzureADTokenExchange'
    ]
  }
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

// Control-plane: registry Contributor role.
resource acrContrib 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, uami.id, 'acr-contrib')
  scope: registry
  properties: {
    // 'Container Registry Contributor'
    roleDefinitionId: resourceId('Microsoft.Authorization/roleDefinitions', '8311e382-0749-4cb8-b61a-304f5fdfa001')
    principalId: uami.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Data-plane push access covers docker push / OCI upload flows.
// Using 'Container Registry Data Contributor' for the workload identity.
resource acrDataContrib 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(registry.id, uami.id, 'acr-data')
  scope: registry
  properties: {
    // 'Container Registry Data Contributor'
    roleDefinitionId: resourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-63fe922ce2fc')
    principalId: uami.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

output clientId string = uami.properties.clientId
output principalId string = uami.properties.principalId
