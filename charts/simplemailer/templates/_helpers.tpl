{{- define "simplemailer.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "simplemailer.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name (include "simplemailer.name" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "simplemailer.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | quote }}
app.kubernetes.io/name: {{ include "simplemailer.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- with .Values.commonLabels }}
{{ toYaml . }}
{{- end }}
{{- end }}

{{- define "simplemailer.selectorLabels" -}}
app.kubernetes.io/name: {{ include "simplemailer.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "simplemailer.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "simplemailer.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{- define "simplemailer.secretName" -}}
{{- default (printf "%s-runtime" (include "simplemailer.fullname" .)) .Values.secrets.existingSecret }}
{{- end }}

{{- define "simplemailer.image" -}}
{{- printf "%s:%s" .repository .tag }}
{{- end }}

{{- define "simplemailer.secretEnv" -}}
{{- $root := index . 0 -}}
{{- $names := index . 1 -}}
{{- range $envName, $valueKey := $names }}
- name: {{ $envName }}
  valueFrom:
    secretKeyRef:
      name: {{ include "simplemailer.secretName" $root }}
      key: {{ index $root.Values.secrets.keys $valueKey }}
      optional: true
{{- end }}
{{- end }}
