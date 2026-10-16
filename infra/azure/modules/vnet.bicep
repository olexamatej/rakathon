// VNet with an AKS-workable default subnet and a subnet delegated to
// PostgreSQL Flexible Server. Only created when deployPostgres is true.
targetScope = 'resourceGroup'

param location string
param vnetName string

resource vnet 'Microsoft.Network/virtualNetworks@2023-09-01' = {
  name: vnetName
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.10.0.0/16'
      ]
    }
    subnets: [
      {
        name: 'aks-default'
        properties: {
          addressPrefix: '10.10.0.0/20'
        }
      }
      {
        name: 'postgres'
        properties: {
          addressPrefix: '10.10.1.0/24'
          delegations: [
            {
              name: 'pg-delegation'
              properties: {
                serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers'
              }
            }
          ]
        }
      }
    ]
  }
}

output vnetResourceId string = vnet.id
