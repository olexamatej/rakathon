// Optional private Azure Database for PostgreSQL Flexible Server.
// Enabled via main.bicep deployPostgres; the server is reachable only from
// the delegated subnet, so it stays closed off by design while the Rust
// storage adapter is still missing.
targetScope = 'resourceGroup'

param location string
param serverName string
param adminLogin string
@secure()
@description('Password generated outside this template by provision.sh (also stored in Key Vault).')
param adminPassword string
@description('VNet resource id containing the delegated subnet.')
param vnetResourceId string

var subnetName = 'postgres'

resource subnet 'Microsoft.Network/virtualNetworks/subnets@2023-09-01' existing = {
  name: subnetName
  parent: existingVnet
}

resource existingVnet 'Microsoft.Network/virtualNetworks@2023-09-01' existing = {
  name: split(vnetResourceId, '/')[8]
}

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: serverName
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: adminLogin
    administratorLoginPassword: adminPassword
    network: {
      delegatedSubnetResourceId: subnet.id
      privateDnsZoneArmResourceId: null // default managed dns zone
    }
    storage: {
      storageSizeGB: 32
      autoGrow: 'Enabled'
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled' // dev only
    }
  }
}

output privateHost string = server.properties.fullyQualifiedDomainName
