// PillGaze transfer API on Azure Kubernetes Service.
// Deployed from an authenticated Azure CLI session by scripts/deploy.sh.
//
// Cost-bearing resources (verify before the first run): AKS system node +
// ACR + Key Vault; PostgreSQL is optional and off by default.
targetScope = 'resourceGroup'

@description('Azure region. eastus2 is verified for Azure Static Web Apps and listed for AKS/ACR/Postgres.')
param location string = 'eastus2'

@description('Short lowercase name prefix. Must survive ACR/KV constraints: 3-16 chars, alphanumerics only.')
@minLength(3)
@maxLength(16)
param prefix string = 'pillgaze'

@description('GitHub repository owner/name whose main-branch CI/CD may push images to ACR.')
param githubRepository string = 'olexamatej/rakathon'

@description('Ref allowed to push images (PillGaze development branch).')
param gitopsRef string = 'main'

@description('VM size for the system node pool.')
param nodeSize string = 'Standard_B2s'

@description('System node count.')
@minValue(1)
@maxValue(3)
param systemNodeCount int = 1

@description('Deploy PostgreSQL Flexible Server now? The Rust API uses SQLite until its storage adapter ships; default false.')
param deployPostgres bool = false

@description('PostgreSQL administrator login; password comes from provision.sh as a secure parameter.')
param postgresAdminLogin string = 'pillgaze_admin'

@secure()
@allowed([
  '' // empty when deployPostgres=false
])
@description('PostgreSQL administrator password; provision.sh generates it and also writes it to Key Vault.')
param postgresAdminPassword string = ''

var uniqueSuffix = uniqueString(resourceGroup().id)
var clusterName = take('${prefix}-dev-aks', 63)
var acrName = toLower(take('${prefix}acr${uniqueSuffix}', 50))
var kvName = toLower(take('kv${prefix}${uniqueSuffix}', 24))
var vnetName = '${prefix}-dev-vnet'

module vnet 'modules/vnet.bicep' = if (deployPostgres) {
  name: 'vnet'
  params: {
    location: location
    vnetName: vnetName
  }
}

module acr 'modules/container-registry.bicep' = {
  name: 'acr'
  params: {
    location: location
    acrName: acrName
  }
}

module aks 'modules/aks.bicep' = {
  name: 'aks'
  params: {
    location: location
    clusterName: clusterName
    nodeSize: nodeSize
    systemNodeCount: systemNodeCount
  }
}

module keyVault 'modules/keyvault.bicep' = {
  name: 'keyvault'
  params: {
    location: location
    keyVaultName: kvName
  }
}

module workloadIdentity 'modules/workload-identity.bicep' = {
  name: 'workloadIdentity'
  params: {
    location: location
    identityName: 'id-workload-transferapi'
    aksOidcIssuerUrl: aks.outputs.oidcIssuerUrl
    keyVaultName: kvName
  }
}

module githubPush 'modules/acr-push-identity.bicep' = {
  name: 'githubPush'
  params: {
    location: location
    identityName: 'id-github-acr-push'
    acrName: acrName
    githubRepository: githubRepository
    gitopsRef: gitopsRef
  }
}

module postgres 'modules/postgresql.bicep' = if (deployPostgres) {
  name: 'postgres'
  params: {
    location: location
    serverName: take('${prefix}-dev-pg', 63)
    adminLogin: postgresAdminLogin
    adminPassword: postgresAdminPassword
    vnetResourceId: vnet.outputs.?vnetResourceId ?? take('${prefix}-dev-vnet', 80)
  }
}

output acrName string = acr.outputs.name
output acrLoginServer string = acr.outputs.loginServer
output clusterName string = aks.outputs.clusterName
output clusterSystemIdentityPrincipalId string = aks.outputs.systemIdentityPrincipalId
output keyVaultName string = keyVault.outputs.name
output githubPushClientId string = githubPush.outputs.clientId
output workloadIdentityClientId string = workloadIdentity.outputs.clientId
output postgresPrivateHost string = deployPostgres ? postgres.outputs.?privateHost ?? '' : ''
