{{/* Expand the name of the chart. */}}
{{- define "transfer-api.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Common fully qualified release name. */}}
{{- define "transfer-api.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride | trunc 63 -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/* Deterministic labels used by every manifest. */}}
{{- define "transfer-api.labels" -}}
app.kubernetes.io/name: {{ include "transfer-api.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/* Service account name resolved from values. */}}
{{- define "transfer-api.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "transfer-api.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/* PVC name resolved from values. */}}
{{- define "transfer-api.pvcName" -}}
{{- if and .Values.database.sqlite.persistentVolume.create .Values.database.sqlite.persistentVolume.existingClaim -}}
{{ fail "database.sqlite.persistentVolume: set either create or existingClaim, not both" }}
{{- else if and .Values.database.sqlite.persistentVolume.create -}}
{{- include "transfer-api.fullname" . }}-data
{{- else -}}
{{- .Values.database.sqlite.persistentVolume.existingClaim -}}
{{- end -}}
{{- end -}}
