// Azure Container Registry storing immutable transfer-api image tags.
// AKS kubelet identity gets pull; GitHub Actions OIDC identity gets push
// (assigned in modules/acr-push-identity.bicep).
targetScope = 'resourceGroup'

param location string
@description('ACR name; lowercase alphanumeric 5–50 chars globally unique.')
param acrName string

var finalAcrName = toLower(acrName)

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: finalAcrName
  location: location
  sku: {
    name: 'Standard'
  }
  properties: {
    adminUserEnabled: false
    // Locked-down network rules belong together with private connections;
    // an over-restrictive default here breaks both AKS pulls and CI pushes.
    networkRuleSet: {
      defaultAction: 'Allow'
    }
  }
}

output id string = registry.id
output loginServer string = registry.properties.loginServer
output name string = registry.name
