// Azure Kubernetes Service hosting the transfer API. Enables OIDC/Workload
// Identity and the Secrets-Store CSI (Key Vault provider) add-on; Flux v2
// is added by scripts/bootstrap-flux.sh as a managed extension so its
// Git source (application pull) stays out of inline Bicep.
targetScope = 'resourceGroup'

param location string
param clusterName string
param nodeSize string
@minValue(1)
@maxValue(3)
param systemNodeCount int

resource aks 'Microsoft.ContainerService/managedClusters@2024-03-02-preview' = {
  name: clusterName
  location: location
  sku: {
    name: 'Base'
    tier: 'Free'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    dnsPrefix: clusterName
    agentPoolProfiles: [
      {
        name: 'system'
        mode: 'System'
        count: systemNodeCount
        vmSize: nodeSize
        osType: 'Linux'
        osSKU: 'Ubuntu'
        minCount: systemNodeCount
        maxCount: systemNodeCount
        enableAutoScaling: false
        orchestratorVersion: '' // latest patch, pinned below by a parameter
      }
    ]
    networkProfile: {
      networkPlugin: 'azure'
      networkPolicy: 'calico'
      loadBalancerSku: 'standard'
    }
    // An Entra-managed group namespace: none for dev; the AKS RBAC rules
    // stay off because no team identity objects are provisioned in this
    // pass; requests must use --token or kubeconfig from a one-off admin
    // grant, not a long-lived kubeconfig secret anywhere in Git.
    aadProfile: {
      managed: true
      enableAzureRBAC: false
    }
    enableRBAC: true
    oidcIssuerProfile: {
      enabled: true
    }
    // Workload Identity required by the Key Vault CSI provider and the
    // transfer-api UAMI federated credential.
    securityProfile: {
      workloadIdentity: {
        enabled: true
      }
    }
    // Pull image from the ACR using the cluster's own identity.
    addonProfiles: {
      azureKeyvaultSecretsProvider: {
        enabled: true
        config: {
          enableSecretRotation: 'false'
        }
      }
    }
  }
}

// An AcrPull role assignment for the cluster's system identity is done in
// scripts/deploy.sh after deployment: the system-assigned principalId only
// exists after the cluster itself is created (Bicep cannot reference it).
// Use:  az role assignment create --assignee <principalId>
//           --role AcrPull --scope <acrId-from-main.bicep-output>

output oidcIssuerUrl string = aks.properties.oidcIssuerProfile.issuerURL
output clusterName string = aks.name
output systemIdentityPrincipalId string = aks.identity.principalId
