<template>
  <section class="semantic-generator">
    <div class="generator-layout">
      <!-- ═══════════════════════════════════════════════════════════════
           PANNEAU PRINCIPAL
      ═══════════════════════════════════════════════════════════════ -->
      <div class="generator-main">
        <!-- HEADER ────────────────────────────────────────────────── -->
        <div class="generator-header">
          <div>
            <p class="eyebrow">Semantic Layer</p>
            <h2>Modélisation Sémantique BI</h2>
            <div class="header-meta">
              <v-chip v-if="selectedDatasource" size="small" color="teal" variant="tonal" prepend-icon="mdi-database">
                {{ selectedDatasource.name }}
              </v-chip>
              <v-chip size="small" color="green" variant="tonal" prepend-icon="mdi-table">
                {{ semantic.layer.tables.length }} tables sauvegardées
              </v-chip>
            </div>
          </div>

          <div class="header-actions">
            <v-btn
              v-if="fromWorkflow"
              size="small"
              variant="tonal"
              prepend-icon="mdi-arrow-left"
              :to="{ path: '/datasources', query: { step: 'semantic' } }"
            >
              Retour workflow
            </v-btn>
            <v-select
              :model-value="currentDatasourceId"
              :items="datasourceOptions"
              label="Datasource"
              variant="outlined"
              density="compact"
              hide-details
              min-width="240"
              @update:model-value="changeDatasource"
            />
            <v-btn
              color="teal"
              prepend-icon="mdi-auto-fix"
              :loading="semantic.generating"
              :disabled="!canManage || !currentDatasourceId || !isDatasourceValid"
              @click="generateProposal"
            >
              Générer
            </v-btn>
            <v-btn
              variant="tonal"
              prepend-icon="mdi-code-json"
              :disabled="!hasSemanticContent"
              @click="exportSemanticLayerJson"
            >
              Export JSON
            </v-btn>
            <v-btn icon="mdi-refresh" variant="tonal" :loading="datasource.loading" @click="reloadDatasources" />
          </div>
        </div>

        <!-- ALERTS ───────────────────────────────────────────────── -->
        <v-alert v-if="!currentDatasourceId" type="info" variant="tonal" class="mb-3">
          Sélectionnez une source de données pour commencer.
        </v-alert>
        <v-alert v-if="!canManage" type="info" variant="tonal" class="mb-3">
          Accès en lecture seule (rôle Viewer).
        </v-alert>
        <v-alert v-if="semantic.error" type="error" variant="tonal" class="mb-3">
          {{ semantic.error }}
        </v-alert>

        <!-- CONTROL STRIP ────────────────────────────────────────── -->
        <div class="control-strip">
          <div class="control-item">
            <v-switch v-model="useAI" color="teal" label="Enrichissement IA" density="compact" hide-details inset />
          </div>
          <v-select
            v-model="semanticLanguage"
            :items="semanticLanguageOptions"
            label="Langue métier"
            color="teal"
            density="compact"
            variant="outlined"
            hide-details
          />
          <v-select
            v-model="businessSector"
            :items="businessSectorOptions"
            label="Secteur d'activité"
            color="teal"
            density="compact"
            variant="outlined"
            hide-details
          />
          <v-select
            v-model="llmProvider"
            :items="llmProviderOptions"
            label="LLM Provider"
            color="teal"
            density="compact"
            variant="outlined"
            hide-details
            prepend-inner-icon="mdi-brain"
          />
          <div class="slider-wrap">
            <span class="slider-label">Échantillon</span>
            <v-slider
              v-model="sampleSize"
              color="teal"
              :min="25"
              :max="500"
              :step="25"
              thumb-label
              hide-details
            />
          </div>
          <div class="control-item">
            <v-switch v-model="overwriteExisting" color="green" label="Regénérer" density="compact" hide-details inset />
          </div>
        </div>

        <!-- PROGRESS ─────────────────────────────────────────────── -->
        <v-expand-transition>
          <div v-if="semantic.generating" class="progress-panel">
            <div class="progress-steps">
              <div
                v-for="(step, idx) in progressSteps"
                :key="step.key"
                class="progress-step"
                :class="{ active: idx <= activeProgressStep, done: idx < activeProgressStep }"
              >
                <div class="progress-step-icon">
                  <v-icon v-if="idx < activeProgressStep" size="14" color="teal">mdi-check</v-icon>
                  <v-progress-circular v-else-if="idx === activeProgressStep" indeterminate size="12" width="2" color="teal" />
                  <v-icon v-else size="14" color="var(--askme-muted)">{{ step.icon }}</v-icon>
                </div>
                <span>{{ step.label }}</span>
              </div>
            </div>
            <v-progress-linear :model-value="generationProgress" color="teal" height="4" rounded class="mt-2" />
          </div>
        </v-expand-transition>

        <!-- ═══════════════════════ PROPOSAL MODE ═══════════════════ -->
        <template v-if="proposal">
          <!-- Summary bar -->
          <div class="proposal-summary">
            <div v-for="stat in proposalStats" :key="stat.key" class="stat-cell">
              <span class="stat-number">{{ stat.value }}</span>
              <span class="stat-label">{{ stat.label }}</span>
            </div>
            <v-progress-circular
              :model-value="Math.round(proposal.confidence * 100)"
              color="teal"
              size="52"
              width="5"
              class="confidence-ring"
            >
              <span class="confidence-text">{{ Math.round(proposal.confidence * 100) }}%</span>
            </v-progress-circular>
          </div>

          <!-- Workflow trace -->
          <div v-if="hasWorkflowTrace" class="workflow-panel">
            <div class="workflow-header">
              <div>
                <p class="eyebrow">Workflow d'analyse</p>
                <h3>Étapes réalisées</h3>
              </div>
              <div class="workflow-chips">
                <v-chip v-for="chip in workflowSummaryChips" :key="chip.label" size="small" :color="chip.color" variant="tonal">
                  {{ chip.label }}
                </v-chip>
              </div>
            </div>
            <div class="workflow-steps">
              <div v-for="step in generationWorkflow" :key="step.key" class="workflow-step">
                <div class="workflow-step-icon">
                  <v-icon :icon="step.icon" size="16" />
                </div>
                <div class="workflow-step-body">
                  <strong>{{ step.title }}</strong>
                  <p>{{ step.description }}</p>
                </div>
                <v-chip size="x-small" color="green" variant="tonal">✓</v-chip>
              </div>
            </div>
          </div>

          <!-- TABS ─────────────────────────────────────────────────── -->
          <v-tabs v-model="activeTab" class="semantic-tabs" color="teal" density="comfortable">
            <v-tab value="tables" prepend-icon="mdi-table">Tables</v-tab>
            <v-tab value="columns" prepend-icon="mdi-view-column">
              Colonnes
              <v-chip v-if="proposal.columns.length" size="x-small" class="ml-1" color="teal" variant="tonal">
                {{ proposal.columns.length }}
              </v-chip>
            </v-tab>
            <v-tab value="kpis" prepend-icon="mdi-chart-line">
              KPIs
              <v-chip v-if="proposal.kpis.length" size="x-small" class="ml-1" color="green" variant="tonal">
                {{ proposal.kpis.length }}
              </v-chip>
            </v-tab>
            <v-tab value="relationships" prepend-icon="mdi-source-branch">Relations</v-tab>
            <v-tab value="synonyms" prepend-icon="mdi-link-variant">
              Synonymes
              <v-chip v-if="proposal.synonyms.length" size="x-small" class="ml-1" color="teal" variant="tonal">
                {{ proposal.synonyms.length }}
              </v-chip>
            </v-tab>
            <v-tab value="warnings" prepend-icon="mdi-alert-outline">
              Alertes
              <v-chip v-if="allWarnings.length" size="x-small" color="amber" class="ml-1">{{ allWarnings.length }}</v-chip>
            </v-tab>
          </v-tabs>

          <v-window v-model="activeTab" class="tab-window">

            <!-- ────────── TAB: TABLES ────────── -->
            <v-window-item value="tables">
              <div class="tab-toolbar">
                <v-text-field
                  v-model="tableSearch"
                  prepend-inner-icon="mdi-magnify"
                  placeholder="Filtrer les tables…"
                  density="compact"
                  variant="outlined"
                  hide-details
                  clearable
                  style="max-width:300px"
                />
              </div>
              <div class="table-surface">
                <v-table density="comfortable">
                  <thead>
                    <tr>
                      <th>Technique</th>
                      <th>Nom métier</th>
                      <th>Description</th>
                      <th>Type</th>
                      <th>Confiance</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="table in filteredTables" :key="table.technicalName">
                      <td class="technical">{{ table.technicalName }}</td>
                      <td>
                        <v-text-field v-model="table.businessName" density="compact" variant="underlined" hide-details />
                      </td>
                      <td class="wide-cell">
                        <v-text-field v-model="table.description" density="compact" variant="underlined" hide-details />
                      </td>
                      <td>
                        <v-select
                          v-model="table.tableType"
                          :items="tableTypes"
                          density="compact"
                          variant="underlined"
                          hide-details
                          @update:model-value="table.source = 'user'"
                        />
                      </td>
                      <td><confidence-chip :value="table.confidence" /></td>
                      <td><source-chip :source="table.source" /></td>
                    </tr>
                  </tbody>
                </v-table>
              </div>
            </v-window-item>

            <!-- ────────── TAB: COLUMNS ────────── -->
            <v-window-item value="columns">
              <div class="tab-toolbar">
                <v-text-field
                  v-model="columnSearch"
                  prepend-inner-icon="mdi-magnify"
                  placeholder="Filtrer les colonnes…"
                  density="compact"
                  variant="outlined"
                  hide-details
                  clearable
                  style="max-width:300px"
                />
                <v-select
                  v-model="columnTypeFilter"
                  :items="semanticTypeFilterOptions"
                  label="Type sémantique"
                  density="compact"
                  variant="outlined"
                  hide-details
                  clearable
                  style="max-width:180px"
                />
                <v-spacer />
                <span class="tab-count">{{ filteredColumns.length }} colonnes</span>
              </div>
              <div class="table-surface">
                <v-table density="comfortable">
                  <thead>
                    <tr>
                      <th>Table</th>
                      <th>Technique</th>
                      <th>Nom métier</th>
                      <th>Type sémantique</th>
                      <th>Type données</th>
                      <th>Nullable</th>
                      <th>Confiance</th>
                      <th>Alertes</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="column in filteredColumns"
                      :key="`${column.tableTechnicalName}.${column.technicalName}`"
                      class="column-row"
                      :class="{ 'column-row--enriched': isColumnEnriched(column.technicalName, column.tableTechnicalName) }"
                    >
                      <td class="technical">{{ column.tableTechnicalName }}</td>
                      <td class="technical">{{ column.technicalName }}</td>
                      <td>
                        <div class="column-name-cell">
                          <v-text-field v-model="column.businessName" density="compact" variant="underlined" hide-details />
                          <v-tooltip v-if="getColumnEnrichment(column.technicalName, column.tableTechnicalName)" location="top">
                            <template #activator="{ props: tipProps }">
                              <v-icon v-bind="tipProps" size="14" color="teal" class="ml-1">mdi-auto-fix</v-icon>
                            </template>
                            {{ getColumnEnrichment(column.technicalName, column.tableTechnicalName)?.description }}
                          </v-tooltip>
                        </div>
                      </td>
                      <td>
                        <v-select
                          v-model="column.semanticType"
                          :items="semanticTypeItems"
                          density="compact"
                          variant="underlined"
                          hide-details
                          @update:model-value="column.source = 'user'"
                        >
                          <template #selection="{ item }">
                            <semantic-type-badge :type="column.semanticType" />
                          </template>
                        </v-select>
                      </td>
                      <td><code class="datatype-badge">{{ column.dataType }}</code></td>
                      <td>
                        <v-icon :color="column.isNullable ? 'amber' : 'green'" size="16">
                          {{ column.isNullable ? 'mdi-circle-half-full' : 'mdi-check-circle-outline' }}
                        </v-icon>
                      </td>
                      <td><confidence-chip :value="column.confidence" /></td>
                      <td>
                        <v-tooltip v-if="column.warnings?.length" location="top">
                          <template #activator="{ props: tipProps }">
                            <v-chip v-bind="tipProps" size="small" color="amber" variant="tonal">
                              {{ column.warnings.length }}
                            </v-chip>
                          </template>
                          <ul>
                            <li v-for="w in column.warnings" :key="w">{{ w }}</li>
                          </ul>
                        </v-tooltip>
                      </td>
                    </tr>
                  </tbody>
                </v-table>
              </div>
            </v-window-item>

            <!-- ────────── TAB: KPIs ────────── -->
            <v-window-item value="kpis">
              <div class="tab-toolbar">
                <span class="tab-count">{{ proposal.kpis.length }} KPIs</span>
                <v-spacer />
                <v-btn size="small" color="teal" variant="tonal" prepend-icon="mdi-plus" @click="addKpi">
                  Nouveau KPI
                </v-btn>
              </div>
              <div class="kpi-grid">
                <article
                  v-for="(kpi, index) in proposal.kpis"
                  :key="kpi.id || `kpi-${index}`"
                  class="kpi-card"
                  :class="{ 'kpi-card--valid': isKpiValid(kpi.sqlFormula), 'kpi-card--invalid': !isKpiValid(kpi.sqlFormula) }"
                >
                  <!-- Card header -->
                  <div class="kpi-card-head">
                    <div class="kpi-card-title-row">
                      <v-icon size="16" :color="isKpiValid(kpi.sqlFormula) ? 'green' : 'red'">
                        {{ isKpiValid(kpi.sqlFormula) ? 'mdi-check-circle-outline' : 'mdi-alert-circle-outline' }}
                      </v-icon>
                      <v-text-field v-model="kpi.name" label="Nom du KPI" density="compact" variant="outlined" hide-details />
                    </div>
                    <v-btn icon="mdi-close" size="x-small" variant="text" @click="removeKpi(index)" />
                  </div>

                  <!-- Formula -->
                  <v-text-field
                    v-model="kpi.sqlFormula"
                    label="Formule SQL"
                    density="compact"
                    variant="outlined"
                    prepend-inner-icon="mdi-function"
                    :color="isKpiValid(kpi.sqlFormula) ? 'green' : 'red'"
                    class="kpi-formula-field"
                  >
                    <template #append-inner>
                      <v-tooltip location="top" text="SUM(col), AVG(col), COUNT(*), etc.">
                        <template #activator="{ props: tipProps }">
                          <v-icon v-bind="tipProps" size="14" color="var(--askme-muted)">mdi-help-circle-outline</v-icon>
                        </template>
                      </v-tooltip>
                    </template>
                  </v-text-field>

                  <!-- Description -->
                  <v-textarea v-model="kpi.description" label="Description métier" rows="2" density="compact" variant="outlined" />

                  <!-- Footer -->
                  <div class="kpi-card-footer">
                    <v-select
                      v-model="kpi.formatting"
                      :items="formattingItems"
                      label="Format"
                      density="compact"
                      variant="outlined"
                      hide-details
                      style="max-width:160px"
                    />
                    <v-chip size="x-small" :color="kpi.source === 'ai' ? 'teal' : kpi.source === 'user' ? 'blue' : 'grey'" variant="tonal">
                      <v-icon start size="10">{{ kpi.source === 'ai' ? 'mdi-brain' : kpi.source === 'user' ? 'mdi-pencil' : 'mdi-cog' }}</v-icon>
                      {{ kpi.source }}
                    </v-chip>
                  </div>
                </article>

                <!-- Add tile -->
                <button class="add-kpi-tile" type="button" @click="addKpi">
                  <v-icon size="28" color="teal">mdi-plus-circle-outline</v-icon>
                  <span>Ajouter un KPI</span>
                </button>
              </div>
            </v-window-item>

            <!-- ────────── TAB: RELATIONSHIPS ────────── -->
            <v-window-item value="relationships">
              <div v-if="relationshipsToShow.length" class="relationship-grid">
                <article
                  v-for="rel in relationshipsToShow"
                  :key="relationshipKey(rel)"
                  class="relationship-card"
                >
                  <div class="relationship-card-head">
                    <div>
                      <p class="eyebrow">Jointure</p>
                      <h3>{{ rel.cardinality }}</h3>
                    </div>
                    <v-chip size="x-small" color="teal" variant="tonal">{{ rel.joinType.toUpperCase() }}</v-chip>
                  </div>
                  <div class="relationship-path">
                    <div class="relationship-side">
                      <small>De</small>
                      <strong>{{ tableLabel(rel.fromTableTechnicalName) }}</strong>
                      <code>{{ rel.fromColumnTechnicalName }}</code>
                    </div>
                    <v-icon size="20" color="var(--askme-muted)">mdi-arrow-right-thin</v-icon>
                    <div class="relationship-side">
                      <small>Vers</small>
                      <strong>{{ tableLabel(rel.toTableTechnicalName) }}</strong>
                      <code>{{ rel.toColumnTechnicalName }}</code>
                    </div>
                  </div>
                  <div class="relationship-footer">
                    <v-progress-linear :model-value="Math.round(rel.confidence * 100)" color="teal" height="4" rounded />
                    <span>{{ Math.round(rel.confidence * 100) }}% de confiance</span>
                  </div>
                </article>
              </div>
              <v-alert v-else type="info" variant="tonal" density="compact">
                Aucune relation sémantique détectée.
              </v-alert>
            </v-window-item>

            <!-- ────────── TAB: SYNONYMS ────────── -->
            <v-window-item value="synonyms">
              <!-- Quick-add -->
              <div class="synonym-add-bar">
                <v-text-field
                  v-model="newSynonym.term"
                  label="Terme ou acronyme"
                  density="compact"
                  variant="outlined"
                  hide-details
                  clearable
                  @keyup.enter="addSynonymFromBar"
                />
                <v-autocomplete
                  v-model="newSynonym.mappedValue"
                  :items="mappingOptions"
                  label="Valeur mappée"
                  density="compact"
                  variant="outlined"
                  hide-details
                  clearable
                  @keyup.enter="addSynonymFromBar"
                />
                <v-btn
                  color="teal"
                  prepend-icon="mdi-plus"
                  :disabled="!newSynonym.term.trim() || !newSynonym.mappedValue"
                  @click="addSynonymFromBar"
                >
                  Ajouter
                </v-btn>
              </div>

              <!-- Synonym chips (current) -->
              <div class="synonym-chips-area">
                <p class="area-label">{{ proposal.synonyms.length }} synonymes actifs</p>
                <div class="synonym-chip-list">
                  <div
                    v-for="(synonym, index) in proposal.synonyms"
                    :key="`${synonym.term}-${synonym.mappedValue}-${index}`"
                    class="synonym-chip-item"
                  >
                    <span class="synonym-chip-term">{{ synonym.term }}</span>
                    <v-icon size="12" color="var(--askme-muted)">mdi-arrow-right-thin</v-icon>
                    <span class="synonym-chip-target">{{ synonym.mappedValue }}</span>
                    <confidence-chip :value="synonym.confidence" />
                    <source-chip :source="synonym.source" />
                    <v-btn icon="mdi-close" size="x-small" variant="text" @click="removeSynonym(index)" />
                  </div>
                </div>
              </div>
            </v-window-item>

            <!-- ────────── TAB: WARNINGS ────────── -->
            <v-window-item value="warnings">
              <v-alert v-if="!allWarnings.length" type="success" variant="tonal">
                Aucune alerte sur la proposition.
              </v-alert>
              <v-list v-else class="warning-list" lines="two">
                <v-list-item v-for="warning in allWarnings" :key="warning" prepend-icon="mdi-alert-outline">
                  {{ warning }}
                </v-list-item>
              </v-list>
            </v-window-item>
          </v-window>

          <!-- SAVE BAR ──────────────────────────────────────────── -->
          <div class="save-bar">
            <v-alert v-if="validationErrors.length" type="warning" variant="tonal" density="compact">
              {{ validationErrors[0] }}
            </v-alert>
            <div class="save-actions">
              <v-btn v-if="editingSavedLayer" variant="text" prepend-icon="mdi-close" @click="cancelEdit">
                Annuler
              </v-btn>
              <v-btn v-else variant="tonal" prepend-icon="mdi-refresh" @click="generateProposal">
                Regénérer
              </v-btn>
              <v-btn
                color="teal"
                prepend-icon="mdi-content-save-check"
                :disabled="Boolean(validationErrors.length) || !canManage"
                @click="confirmSave = true"
              >
                Sauvegarder
              </v-btn>
            </div>
          </div>
        </template>

        <!-- ═══════════════════════ SAVED LAYER MODE ════════════════ -->
        <template v-else-if="!semantic.generating">
          <div class="saved-layer">
            <!-- Empty state -->
            <div v-if="!semantic.layer.tables.length" class="empty-state">
              <v-icon size="52" color="teal">mdi-shape-outline</v-icon>
              <h3>Aucune couche sémantique sauvegardée</h3>
              <p class="empty-hint">Générez automatiquement la modélisation BI à partir de votre schéma de base.</p>
              <v-btn color="teal" prepend-icon="mdi-auto-fix" size="large" :disabled="!canManage" @click="generateProposal">
                Générer la couche sémantique
              </v-btn>
            </div>

            <!-- Saved layer content -->
            <div v-else>
              <div class="saved-header">
                <div>
                  <h3>Couche sémantique active</h3>
                  <div class="saved-counts">
                    <v-chip size="small" color="teal" variant="tonal">{{ semantic.layer.tables.length }} tables</v-chip>
                    <v-chip size="small" color="green" variant="tonal">{{ savedColumnRows.length }} colonnes</v-chip>
                    <v-chip size="small" color="teal" variant="tonal">{{ semantic.layer.kpis.length }} KPIs</v-chip>
                    <v-chip size="small" color="green" variant="tonal">{{ semantic.layer.relationships.length }} relations</v-chip>
                    <v-chip size="small" color="green" variant="tonal">{{ semantic.layer.synonyms.length }} synonymes</v-chip>
                  </div>
                </div>
                <div class="saved-actions">
                  <v-btn color="teal" variant="tonal" prepend-icon="mdi-pencil-outline" :disabled="!canManage" @click="editSavedLayer">
                    Modifier
                  </v-btn>
                  <v-btn variant="tonal" prepend-icon="mdi-auto-fix" :disabled="!canManage" @click="generateProposal">
                    Regénérer
                  </v-btn>
                  <v-btn color="red" variant="tonal" prepend-icon="mdi-delete-outline" :loading="semantic.deleting" :disabled="!canManage" @click="confirmDelete = true">
                    Supprimer
                  </v-btn>
                </div>
              </div>

              <!-- Saved tabs -->
              <v-tabs v-model="savedActiveTab" class="semantic-tabs saved-tabs" color="teal" density="comfortable">
                <v-tab value="tables" prepend-icon="mdi-table">Tables</v-tab>
                <v-tab value="columns" prepend-icon="mdi-view-column">Colonnes</v-tab>
                <v-tab value="kpis" prepend-icon="mdi-chart-line">KPIs</v-tab>
                <v-tab value="relationships" prepend-icon="mdi-source-branch">Relations</v-tab>
                <v-tab value="synonyms" prepend-icon="mdi-link-variant">Synonymes</v-tab>
              </v-tabs>

              <v-window v-model="savedActiveTab" class="tab-window saved-tab-window">
                <v-window-item value="tables">
                  <v-expansion-panels>
                    <v-expansion-panel v-for="table in semantic.layer.tables" :key="table.id">
                      <v-expansion-panel-title>
                        <v-icon size="16" class="mr-2" color="teal">{{ table.tableType === 'fact' ? 'mdi-table-star' : 'mdi-table' }}</v-icon>
                        {{ table.businessName }}
                        <span class="technical saved-technical-name">{{ table.technicalName }}</span>
                        <v-chip size="x-small" class="ml-2" color="teal" variant="tonal">{{ table.tableType }}</v-chip>
                      </v-expansion-panel-title>
                      <v-expansion-panel-text>
                        <p v-if="table.description" class="saved-description">{{ table.description }}</p>
                        <v-table density="compact">
                          <thead>
                            <tr>
                              <th>Technique</th>
                              <th>Métier</th>
                              <th>Type sémantique</th>
                              <th>Type données</th>
                              <th>Nullable</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr v-for="column in table.columns" :key="column.id">
                              <td class="technical">{{ column.technicalName }}</td>
                              <td>{{ column.businessName }}</td>
                              <td><semantic-type-badge :type="column.semanticType" /></td>
                              <td><code class="datatype-badge">{{ column.dataType }}</code></td>
                              <td>{{ column.isNullable ? 'Oui' : 'Non' }}</td>
                            </tr>
                          </tbody>
                        </v-table>
                      </v-expansion-panel-text>
                    </v-expansion-panel>
                  </v-expansion-panels>
                </v-window-item>

                <v-window-item value="columns">
                  <div class="table-surface">
                    <v-table density="comfortable">
                      <thead>
                        <tr>
                          <th>Table</th>
                          <th>Technique</th>
                          <th>Métier</th>
                          <th>Type sémantique</th>
                          <th>Type données</th>
                          <th>Nullable</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="column in savedColumnRows" :key="`${column.tableTechnicalName}.${column.id}`">
                          <td class="technical">{{ column.tableBusinessName }}</td>
                          <td class="technical">{{ column.technicalName }}</td>
                          <td>{{ column.businessName }}</td>
                          <td><semantic-type-badge :type="column.semanticType" /></td>
                          <td><code class="datatype-badge">{{ column.dataType }}</code></td>
                          <td>{{ column.isNullable ? 'Oui' : 'Non' }}</td>
                        </tr>
                      </tbody>
                    </v-table>
                  </div>
                </v-window-item>

                <v-window-item value="kpis">
                  <div v-if="semantic.layer.kpis.length" class="saved-kpi-grid">
                    <article v-for="kpi in semantic.layer.kpis" :key="kpi.id" class="saved-kpi-card">
                      <div class="saved-kpi-head">
                        <strong>{{ kpi.name }}</strong>
                        <v-chip size="x-small" :color="formattingColor(kpi.formatting)" variant="tonal">{{ kpi.formatting }}</v-chip>
                      </div>
                      <code class="kpi-formula-display">{{ kpi.sqlFormula }}</code>
                      <p v-if="kpi.description">{{ kpi.description }}</p>
                    </article>
                  </div>
                  <v-alert v-else type="info" variant="tonal" density="compact">Aucun KPI sauvegardé.</v-alert>
                </v-window-item>

                <v-window-item value="relationships">
                  <div v-if="semantic.layer.relationships.length" class="relationship-grid">
                    <article v-for="rel in semantic.layer.relationships" :key="relationshipKey(rel)" class="relationship-card">
                      <div class="relationship-card-head">
                        <div>
                          <p class="eyebrow">Jointure</p>
                          <h3>{{ rel.cardinality }}</h3>
                        </div>
                        <v-chip size="x-small" color="teal" variant="tonal">{{ rel.joinType.toUpperCase() }}</v-chip>
                      </div>
                      <div class="relationship-path">
                        <div class="relationship-side">
                          <small>De</small>
                          <strong>{{ tableLabel(rel.fromTableTechnicalName) }}</strong>
                          <code>{{ rel.fromColumnTechnicalName }}</code>
                        </div>
                        <v-icon size="20">mdi-arrow-right-thin</v-icon>
                        <div class="relationship-side">
                          <small>Vers</small>
                          <strong>{{ tableLabel(rel.toTableTechnicalName) }}</strong>
                          <code>{{ rel.toColumnTechnicalName }}</code>
                        </div>
                      </div>
                      <div class="relationship-footer">
                        <v-progress-linear :model-value="Math.round(rel.confidence * 100)" color="teal" height="4" rounded />
                        <span>{{ Math.round(rel.confidence * 100) }}% confidence</span>
                      </div>
                    </article>
                  </div>
                  <v-alert v-else type="info" variant="tonal" density="compact">Aucune relation sauvegardée.</v-alert>
                </v-window-item>

                <v-window-item value="synonyms">
                  <div v-if="semantic.layer.synonyms.length" class="synonym-chip-list saved-synonym-list">
                    <div v-for="syn in semantic.layer.synonyms" :key="syn.id" class="synonym-chip-item">
                      <span class="synonym-chip-term">{{ syn.term }}</span>
                      <v-icon size="12">mdi-arrow-right-thin</v-icon>
                      <span class="synonym-chip-target">{{ syn.mappedValue }}</span>
                    </div>
                  </div>
                  <v-alert v-else type="info" variant="tonal" density="compact">Aucun synonyme sauvegardé.</v-alert>
                </v-window-item>
              </v-window>
            </div>
          </div>
        </template>
      </div>

      <!-- ═══════════════════════════════════════════════════════════════
           PANNEAU INSIGHT LATÉRAL
      ═══════════════════════════════════════════════════════════════ -->
      <semantic-insight-panel
        :open="insightPanelOpen"
        :enriching="enriching"
        :can-enrich="hasSemanticContent"
        :sector-label="selectedBusinessSectorLabel"
        :column-suggestions="mcpColumns"
        :kpi-suggestions="mcpKpis"
        :synonym-suggestions="mcpSynonyms"
        :sector-insights="mcpInsights"
        :last-provider="mcpLastProvider"
        :llm-provider="llmProvider"
        @toggle="insightPanelOpen = !insightPanelOpen"
        @enrich="runMcpEnrichment"
        @apply-column="applyColumnSuggestion"
        @apply-kpi="applyKpiSuggestion"
        @apply-synonym="applySynonymSuggestion"
        @use-insight="handleInsightClick"
      />
    </div>

    <!-- ═══ DIALOGS ═══════════════════════════════════════════════════ -->
    <v-dialog v-model="confirmSave" max-width="460">
      <v-card class="dialog-card">
        <v-card-title>Sauvegarder cette couche sémantique ?</v-card-title>
        <v-card-text>
          <div class="confirm-grid">
            <span>{{ proposal?.tables.length || 0 }} tables</span>
            <span>{{ proposal?.columns.length || 0 }} colonnes</span>
            <span>{{ proposal?.kpis.length || 0 }} KPIs</span>
            <span>{{ proposal?.synonyms.length || 0 }} synonymes</span>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="confirmSave = false">Annuler</v-btn>
          <v-btn color="teal" :loading="semantic.saving" @click="saveProposal">Sauvegarder</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="confirmDelete" max-width="420">
      <v-card class="dialog-card">
        <v-card-title>Supprimer la couche sémantique ?</v-card-title>
        <v-card-text>Cette action supprime toutes les tables, colonnes, KPIs et synonymes de cette source.</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="confirmDelete = false">Annuler</v-btn>
          <v-btn color="red" :loading="semantic.deleting" @click="deleteLayer">Supprimer</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Snackbar success -->
    <v-snackbar v-model="success" color="green" timeout="2800">
      {{ successMessage }}
    </v-snackbar>

    <!-- Snackbar enrichissement -->
    <v-snackbar v-model="enrichSuccess" color="teal" timeout="3200">
      <v-icon start>mdi-auto-fix</v-icon>
      {{ enrichSuccessMessage }}
    </v-snackbar>
  </section>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.store';
import { useDatasourceStore } from '../../stores/datasource.store';
import { useSemanticStore } from '../../stores/semantic.store';
import { apiClient } from '../../services/api/client';
import SemanticInsightPanel from './SemanticInsightPanel.vue';
import type {
  McpEnrichColumnResult,
  McpEnrichKpiResult,
  McpEnrichSynonymResult,
  McpEnrichmentResponse
} from '../../types/semantic-mcp.types';
import type {
  SemanticBusinessSector,
  SemanticKpiProposal,
  SemanticLayerLanguage,
  SemanticProposal,
  SemanticRelationship,
  SemanticTableType,
  SemanticType
} from '../../types';

// ─── Inline sub-components ───────────────────────────────────────────────────

const ConfidenceChip = defineComponent({
  props: { value: { type: Number, required: true } },
  setup(props) {
    return () =>
      h('span', { class: ['confidence-chip', props.value >= 0.8 ? 'high' : props.value >= 0.6 ? 'medium' : 'low'] },
        `${Math.round(props.value * 100)}%`);
  }
});

const SourceChip = defineComponent({
  props: { source: { type: String, required: true } },
  setup(props) {
    return () => h('span', { class: ['source-chip', props.source] }, props.source);
  }
});

const SemanticTypeBadge = defineComponent({
  props: { type: { type: String, required: true } },
  setup(props) {
    const colorMap: Record<string, string> = {
      measure: '#10b981', dimension: '#3b82f6', date: '#f59e0b',
      identifier: '#8b5cf6', attribute: '#06b6d4',
      technical_date: '#f97316', boolean_flag: '#ec4899', sensitive: '#ef4444', unknown: '#6b7280'
    };
    const color = colorMap[props.type] || '#6b7280';
    return () => h('span', {
      style: {
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        fontSize: '0.72rem', fontWeight: '600', padding: '2px 7px',
        borderRadius: '999px', background: `${color}20`, color
      }
    }, props.type);
  }
});

// ─── Setup ───────────────────────────────────────────────────────────────────

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const datasource = useDatasourceStore();
const semantic = useSemanticStore();

// ─── Reactive state ───────────────────────────────────────────────────────────

const activeTab = ref('tables');
const savedActiveTab = ref('tables');
const editingSavedLayer = ref(false);
const useAI = ref(true);
const overwriteExisting = ref(false);
const sampleSize = ref(100);
const semanticLanguage = ref<SemanticLayerLanguage>('fr');
const businessSector = ref<SemanticBusinessSector>('sales_distribution');
const llmProvider = ref<'auto' | 'groq' | 'ollama' | 'openrouter'>('auto');
const activeProgressStep = ref(0);
const progressTimer = ref<number | undefined>();
const confirmSave = ref(false);
const confirmDelete = ref(false);
const success = ref(false);
const successMessage = ref('Couche sémantique sauvegardée.');
const newSynonym = ref({ term: '', mappedValue: '' });
const generationWorkflowMeta = ref<GenerationWorkflowMeta | null>(null);
const tableSearch = ref('');
const columnSearch = ref('');
const columnTypeFilter = ref<string | null>(null);

// MCP enrichment state
const insightPanelOpen = ref(true);
const enriching = ref(false);
const enrichSuccess = ref(false);
const enrichSuccessMessage = ref('');
const mcpColumns = ref<McpEnrichColumnResult[]>([]);
const mcpKpis = ref<McpEnrichKpiResult[]>([]);
const mcpSynonyms = ref<McpEnrichSynonymResult[]>([]);
const mcpInsights = ref<string[]>([]);
const mcpLastProvider = ref('');

// ─── Types ────────────────────────────────────────────────────────────────────

interface GenerationWorkflowMeta {
  sampleSize: number;
  useAI: boolean;
  semanticLanguage: SemanticLayerLanguage;
  businessSector: SemanticBusinessSector;
  overwriteExisting: boolean;
}

// ─── Static data ──────────────────────────────────────────────────────────────

const semanticTypes: SemanticType[] = ['measure', 'dimension', 'date', 'identifier', 'attribute', 'technical_date', 'boolean_flag', 'sensitive', 'unknown'];
const tableTypes: SemanticTableType[] = ['fact', 'dimension', 'unknown'];
const formattingTypes = ['currency', 'number', 'percent', 'integer'];

const formattingItems = formattingTypes.map((f) => ({
  title: f.charAt(0).toUpperCase() + f.slice(1),
  value: f
}));

const semanticTypeItems = semanticTypes.map((t) => ({ title: t, value: t }));

const semanticTypeFilterOptions = [
  { title: 'Toutes', value: null },
  ...semanticTypes.map((t) => ({ title: t, value: t }))
];

const progressSteps = [
  { key: 'schema', label: 'Extraction schéma', icon: 'mdi-database-search-outline' },
  { key: 'profile', label: 'Profilage colonnes', icon: 'mdi-chart-box-outline' },
  { key: 'classify', label: 'Classification', icon: 'mdi-shape-outline' },
  { key: 'relations', label: 'Relations', icon: 'mdi-source-branch' },
  { key: 'kpis', label: 'KPIs & synonymes', icon: 'mdi-chart-line' }
];

const semanticLanguageOptions = [
  { title: 'Français', value: 'fr' },
  { title: 'English', value: 'en' },
  { title: 'Arabic / عربي', value: 'ar' },
  { title: 'Auto-detect', value: 'auto' }
];

const businessSectorOptions = [
  { title: 'Ventes / Commerce / Distribution', value: 'sales_distribution' },
  { title: 'Finance / Comptabilité / Contrôle de gestion', value: 'finance_accounting' },
  { title: 'Ressources humaines', value: 'human_resources' },
  { title: 'Logistique / Transport / Supply Chain', value: 'logistics_supply_chain' },
  { title: 'Production / Industrie / Manufacturing', value: 'manufacturing_production' },
  { title: 'Marketing / CRM / Relation client', value: 'marketing_crm' },
  { title: 'Santé / Cliniques / Hôpitaux', value: 'healthcare' },
  { title: 'Éducation / Formation', value: 'education_training' },
  { title: 'Banque / Assurance / Services financiers', value: 'banking_insurance' },
  { title: 'Immobilier / Construction / Patrimoine', value: 'real_estate_construction' }
];

const llmProviderOptions = [
  { title: 'Auto (détection)', value: 'auto' },
  { title: 'Groq (Llama-3.3)', value: 'groq' },
  { title: 'OpenRouter', value: 'openrouter' },
  { title: 'Ollama local', value: 'ollama' }
];

// ─── Computed ─────────────────────────────────────────────────────────────────

const canManage = computed(() => auth.user?.role !== 'Viewer');
const proposal = computed(() => semantic.proposal);
const currentSemanticLayer = computed(() => proposal.value || semantic.layer);
const datasourceOptions = computed(() =>
  datasource.items.map((item) => ({ title: item.name, value: item.id }))
);
const currentDatasourceId = computed(() => {
  const fromRoute = route.params.sourceId;
  if (typeof fromRoute === 'string' && fromRoute && fromRoute !== 'default') return fromRoute;
  return datasource.selectedId;
});
const fromWorkflow = computed(() => route.query.from === 'workflow');
const selectedDatasource = computed(() => datasource.items.find((item) => item.id === currentDatasourceId.value));
const isDatasourceValid = computed(() => datasource.items.some((item) => item.id === currentDatasourceId.value));
const generationProgress = computed(() => ((activeProgressStep.value + 1) / progressSteps.length) * 100);
const savedColumnRows = computed(() =>
  semantic.layer.tables.flatMap((table) =>
    table.columns.map((column) => ({ ...column, tableTechnicalName: table.technicalName, tableBusinessName: table.businessName }))
  )
);
const relationshipsToShow = computed(() => currentSemanticLayer.value.relationships || []);
const hasSemanticContent = computed(
  () => Boolean(proposal.value) || Boolean(semantic.layer.tables.length) || Boolean(semantic.layer.kpis.length)
);
const currentColumnCount = computed(() =>
  proposal.value ? proposal.value.columns.length : semantic.layer.tables.reduce((sum, t) => sum + t.columns.length, 0)
);
const currentKpiCount = computed(() => currentSemanticLayer.value.kpis.length);
const currentSynonymCount = computed(() => currentSemanticLayer.value.synonyms.length);
const existingColumnNames = computed(() => new Set(proposal.value?.columns.map((c) => c.technicalName) || []));

const proposalStats = computed(() => {
  if (!proposal.value) return [];
  return [
    { key: 'tables', value: proposal.value.tables.length, label: 'Tables' },
    { key: 'columns', value: proposal.value.columns.length, label: 'Colonnes' },
    { key: 'kpis', value: proposal.value.kpis.length, label: 'KPIs' },
    { key: 'relations', value: proposal.value.relationships.length, label: 'Relations' },
    { key: 'synonyms', value: proposal.value.synonyms.length, label: 'Synonymes' }
  ];
});

const filteredTables = computed(() => {
  if (!proposal.value) return [];
  const q = tableSearch.value.toLowerCase().trim();
  if (!q) return proposal.value.tables;
  return proposal.value.tables.filter(
    (t) => t.technicalName.toLowerCase().includes(q) || t.businessName.toLowerCase().includes(q)
  );
});

const filteredColumns = computed(() => {
  if (!proposal.value) return [];
  let cols = proposal.value.columns;
  if (columnTypeFilter.value) cols = cols.filter((c) => c.semanticType === columnTypeFilter.value);
  const q = columnSearch.value.toLowerCase().trim();
  if (q) cols = cols.filter((c) => c.technicalName.toLowerCase().includes(q) || c.businessName.toLowerCase().includes(q));
  return cols;
});

const selectedBusinessSectorLabel = computed(
  () => businessSectorOptions.find((o) => o.value === businessSector.value)?.title || businessSector.value
);

const workflowMeta = computed<GenerationWorkflowMeta>(() => ({
  sampleSize: generationWorkflowMeta.value?.sampleSize ?? sampleSize.value,
  useAI: generationWorkflowMeta.value?.useAI ?? useAI.value,
  semanticLanguage: generationWorkflowMeta.value?.semanticLanguage ?? semanticLanguage.value,
  businessSector: generationWorkflowMeta.value?.businessSector ?? businessSector.value,
  overwriteExisting: generationWorkflowMeta.value?.overwriteExisting ?? overwriteExisting.value
}));

const selectedBusinessSector = computed(
  () => businessSectorOptions.find((item) => item.value === workflowMeta.value.businessSector) || businessSectorOptions[0]
);

const hasWorkflowTrace = computed(() => Boolean(generationWorkflowMeta.value) || Boolean(proposal.value));

const generationWorkflow = computed(() => {
  if (!hasSemanticContent.value) return [];
  const datasourceName = selectedDatasource.value?.name || currentDatasourceId.value || 'la source';
  const relCount = relationshipsToShow.value.length;
  return [
    { key: 'metadata', title: 'Inspection des métadonnées', description: `Schéma et échantillon lus depuis ${datasourceName}.`, icon: 'mdi-database-search-outline' },
    { key: 'profile', title: 'Profilage des colonnes', description: `${workflowMeta.value.sampleSize} lignes profilées pour inférer types, nullabilité et patterns.`, icon: 'mdi-chart-box-outline' },
    { key: 'classify', title: 'Classification sémantique', description: `${currentSemanticLayer.value.tables.length} tables et ${currentColumnCount.value} colonnes modélisées.`, icon: 'mdi-shape-outline' },
    { key: 'relationships', title: 'Inférence des relations', description: `${relCount} relation${relCount !== 1 ? 's' : ''} détectée${relCount !== 1 ? 's' : ''}.`, icon: 'mdi-source-branch' },
    { key: 'kpis', title: 'KPIs & synonymes', description: `${currentKpiCount.value} KPI${currentKpiCount.value !== 1 ? 's' : ''} et ${currentSynonymCount.value} synonyme${currentSynonymCount.value !== 1 ? 's' : ''} générés.`, icon: 'mdi-chart-line' },
    { key: 'enrichment', title: 'Langage métier appliqué', description: `${selectedBusinessSector.value.title} · ${workflowMeta.value.semanticLanguage.toUpperCase()} ${workflowMeta.value.useAI ? '· Enrichissement IA' : '· Heuristique uniquement'}.`, icon: 'mdi-translate' }
  ];
});

const workflowSummaryChips = computed(() => [
  { label: selectedDatasource.value?.name || currentDatasourceId.value || 'Source', color: 'teal' },
  { label: selectedBusinessSector.value.title, color: 'teal' },
  { label: `Échantillon ${workflowMeta.value.sampleSize}`, color: 'green' },
  { label: workflowMeta.value.semanticLanguage.toUpperCase(), color: 'teal' },
  { label: workflowMeta.value.useAI ? 'Enrichissement IA' : 'Heuristique seul', color: workflowMeta.value.useAI ? 'green' : 'amber' }
]);

const mappingOptions = computed(() => {
  if (!proposal.value) return [];
  return [
    ...proposal.value.tables.map((t) => ({ title: t.technicalName, value: t.technicalName })),
    ...proposal.value.columns.map((c) => ({ title: c.technicalName, value: c.technicalName })),
    ...proposal.value.kpis.map((k) => ({ title: k.name, value: k.name }))
  ];
});

const allWarnings = computed(() => {
  if (!proposal.value) return [];
  return Array.from(new Set([...proposal.value.warnings, ...proposal.value.columns.flatMap((c) => c.warnings || [])]));
});

const validationErrors = computed(() => {
  if (!proposal.value) return [];
  const errors: string[] = [];
  if (!proposal.value.tables.length) errors.push('Au moins une table est requise.');
  if (proposal.value.tables.some((t) => !t.businessName.trim())) errors.push('Chaque table doit avoir un nom métier.');
  if (proposal.value.columns.some((c) => !c.businessName.trim())) errors.push('Chaque colonne doit avoir un nom métier.');
  const invalidKpi = proposal.value.kpis.find((k) => !isKpiValid(k.sqlFormula));
  if (invalidKpi) errors.push(`Formule KPI invalide : ${invalidKpi.name || invalidKpi.sqlFormula}`);
  const validMappings = new Set(mappingOptions.value.map((o) => o.value));
  const invalidSynonym = proposal.value.synonyms.find((s) => !s.term.trim() || !validMappings.has(s.mappedValue));
  if (invalidSynonym) errors.push(`Synonyme invalide : ${invalidSynonym.term || invalidSynonym.mappedValue}`);
  return errors;
});

// ─── MCP enrichment computed helpers ─────────────────────────────────────────

const columnEnrichmentMap = computed(() => {
  const map = new Map<string, McpEnrichColumnResult>();
  for (const col of mcpColumns.value) {
    map.set(`${col.tableTechnicalName}.${col.technicalName}`, col);
  }
  return map;
});

const isColumnEnriched = (tech: string, table: string) => columnEnrichmentMap.value.has(`${table}.${tech}`);
const getColumnEnrichment = (tech: string, table: string) => columnEnrichmentMap.value.get(`${table}.${tech}`);

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(async () => {
  if (!datasource.items.length) await datasource.fetchAll();
  await ensureValidDatasourceContext();
});

watch(
  () => currentDatasourceId.value,
  async (value, previous) => {
    if (!value || value === previous) return;
    if (!datasource.items.some((item) => item.id === value)) return;
    await semantic.fetchLayer(value);
    // Clear MCP results when datasource changes
    mcpColumns.value = [];
    mcpKpis.value = [];
    mcpSynonyms.value = [];
    mcpInsights.value = [];
    mcpLastProvider.value = '';
  }
);

// ─── Actions ──────────────────────────────────────────────────────────────────

const changeDatasource = async (value: string) => {
  if (!value) return;
  datasource.setSelected(value);
  semantic.proposal = null;
  await router.push({ path: `/semantic/${value}`, query: fromWorkflow.value ? { from: 'workflow' } : {} });
};

const reloadDatasources = async () => {
  await datasource.fetchAll();
  await ensureValidDatasourceContext();
};

const generateProposal = async () => {
  if (!currentDatasourceId.value || !isDatasourceValid.value) return;
  editingSavedLayer.value = false;
  generationWorkflowMeta.value = {
    sampleSize: sampleSize.value,
    useAI: useAI.value,
    semanticLanguage: semanticLanguage.value,
    businessSector: businessSector.value,
    overwriteExisting: overwriteExisting.value
  };
  startProgress();
  await semantic.generateProposal(currentDatasourceId.value, {
    useAI: useAI.value,
    sampleSize: sampleSize.value,
    overwriteExisting: overwriteExisting.value,
    semanticLanguage: semanticLanguage.value,
    businessSector: businessSector.value
  });
  stopProgress();
  activeTab.value = 'tables';
};

const editSavedLayer = () => {
  if (!currentDatasourceId.value || !semantic.layer.tables.length) return;
  const proposalDraft: SemanticProposal = {
    datasourceId: currentDatasourceId.value,
    confidence: 0.95,
    tables: semantic.layer.tables.map((table) => ({
      technicalName: table.technicalName,
      businessName: table.businessName,
      description: table.description,
      tableType: table.tableType,
      confidence: 0.95,
      source: 'user'
    })),
    columns: semantic.layer.tables.flatMap((table) =>
      table.columns.map((col) => ({
        tableTechnicalName: table.technicalName,
        technicalName: col.technicalName,
        businessName: col.businessName,
        semanticType: col.semanticType,
        dataType: col.dataType,
        isNullable: col.isNullable,
        confidence: 0.95,
        source: 'user',
        warnings: []
      }))
    ),
    kpis: semantic.layer.kpis.map((kpi) => ({
      id: kpi.id,
      name: kpi.name,
      sqlFormula: kpi.sqlFormula,
      description: kpi.description,
      formatting: normalizeKpiFormatting(kpi.formatting),
      confidence: 0.95,
      source: 'user'
    })),
    synonyms: semantic.layer.synonyms.map((s) => ({ term: s.term, mappedValue: s.mappedValue, confidence: 0.95, source: 'user' })),
    relationships: semantic.layer.relationships.map((r) => ({ ...r })),
    warnings: ['Édition de la couche sauvegardée. Les modifications ne sont persistées qu'après sauvegarde.']
  };
  semantic.proposal = proposalDraft;
  editingSavedLayer.value = true;
  activeTab.value = 'tables';
};

const cancelEdit = () => {
  semantic.proposal = null;
  editingSavedLayer.value = false;
  newSynonym.value = { term: '', mappedValue: '' };
};

const saveProposal = async () => {
  if (!currentDatasourceId.value || validationErrors.value.length) return;
  await semantic.saveProposal(currentDatasourceId.value, true);
  confirmSave.value = false;
  editingSavedLayer.value = false;
  successMessage.value = 'Couche sémantique sauvegardée avec succès.';
  success.value = true;
};

const deleteLayer = async () => {
  if (!currentDatasourceId.value) return;
  await semantic.deleteLayer(currentDatasourceId.value);
  confirmDelete.value = false;
};

const addKpi = () => {
  if (!proposal.value) return;
  proposal.value.kpis.push({
    id: createLocalId('kpi'),
    name: 'Nouveau KPI',
    sqlFormula: 'COUNT(*)',
    description: '',
    formatting: 'integer',
    confidence: 0.5,
    source: 'user'
  });
};

const removeKpi = (index: number) => { proposal.value?.kpis.splice(index, 1); };

const addSynonymFromBar = () => {
  if (!proposal.value || !newSynonym.value.term.trim() || !newSynonym.value.mappedValue) return;
  proposal.value.synonyms.push({
    term: newSynonym.value.term.trim(),
    mappedValue: newSynonym.value.mappedValue,
    confidence: 0.75,
    source: 'user'
  });
  newSynonym.value = { term: '', mappedValue: '' };
};

const removeSynonym = (index: number) => { proposal.value?.synonyms.splice(index, 1); };

// ─── MCP Enrichment ───────────────────────────────────────────────────────────

const runMcpEnrichment = async () => {
  if (!currentDatasourceId.value || !hasSemanticContent.value) return;
  enriching.value = true;
  try {
    const currentProposal = proposal.value;
    const response = await apiClient.post<McpEnrichmentResponse>(
      `/semantic-layer/${currentDatasourceId.value}/mcp-enrich`,
      {
        businessSector: businessSector.value,
        language: semanticLanguage.value === 'auto' ? 'fr' : semanticLanguage.value,
        columns: currentProposal?.columns || [],
        kpis: currentProposal?.kpis || [],
        synonyms: currentProposal?.synonyms || [],
        provider: llmProvider.value
      }
    );
    mcpColumns.value = response.data.columns || [];
    mcpKpis.value = response.data.kpis || [];
    mcpSynonyms.value = response.data.synonyms || [];
    mcpInsights.value = response.data.sectorInsights || [];
    mcpLastProvider.value = response.data.provider || '';

    const total = mcpColumns.value.length + mcpKpis.value.length + mcpSynonyms.value.length;
    enrichSuccessMessage.value = `Enrichissement terminé · ${total} suggestions générées via ${response.data.provider}.`;
    enrichSuccess.value = true;
    insightPanelOpen.value = true;
  } catch (err) {
    console.error('[MCP Enrich]', err);
  } finally {
    enriching.value = false;
  }
};

const applyColumnSuggestion = (col: McpEnrichColumnResult) => {
  if (!proposal.value) return;
  const target = proposal.value.columns.find(
    (c) => c.technicalName === col.technicalName && c.tableTechnicalName === col.tableTechnicalName
  );
  if (target) {
    target.businessName = col.suggestedBusinessName;
    target.source = 'ai';
  }
  enrichSuccessMessage.value = `Nom "${col.suggestedBusinessName}" appliqué à ${col.technicalName}.`;
  enrichSuccess.value = true;
};

const applyKpiSuggestion = (kpi: McpEnrichKpiResult) => {
  if (!proposal.value) return;
  proposal.value.kpis.push({
    id: createLocalId('kpi'),
    name: kpi.name,
    sqlFormula: kpi.sqlFormula,
    description: kpi.description,
    formatting: kpi.formatting,
    confidence: 0.85,
    source: 'ai'
  });
  activeTab.value = 'kpis';
  enrichSuccessMessage.value = `KPI "${kpi.name}" ajouté à la proposition.`;
  enrichSuccess.value = true;
};

const applySynonymSuggestion = (syn: McpEnrichSynonymResult) => {
  if (!proposal.value) return;
  const existing = proposal.value.synonyms.find((s) => s.term === syn.term && s.mappedValue === syn.mappedValue);
  if (!existing) {
    proposal.value.synonyms.push({ term: syn.term, mappedValue: syn.mappedValue, confidence: 0.8, source: 'ai' });
    activeTab.value = 'synonyms';
    enrichSuccessMessage.value = `Synonyme "${syn.term} → ${syn.mappedValue}" ajouté.`;
    enrichSuccess.value = true;
  }
};

const handleInsightClick = (insight: string) => {
  // Copy insight to clipboard for easy pasting in the chat
  navigator.clipboard?.writeText(insight).catch(() => {});
  enrichSuccessMessage.value = `Question copiée dans le presse-papiers.`;
  enrichSuccess.value = true;
};

// ─── Export ───────────────────────────────────────────────────────────────────

const exportSemanticLayerJson = () => {
  if (!hasSemanticContent.value || !currentDatasourceId.value) return;
  const exportedAt = new Date().toISOString();
  const state = proposal.value ? (editingSavedLayer.value ? 'editing' : 'proposal') : 'saved';
  const payload = {
    version: '1.0',
    exportedAt,
    datasource: { id: currentDatasourceId.value, name: selectedDatasource.value?.name, type: selectedDatasource.value?.type, schema: selectedDatasource.value?.schema },
    businessContext: { sectorCode: workflowMeta.value.businessSector, sectorLabel: selectedBusinessSector.value.title, language: workflowMeta.value.semanticLanguage, useAI: workflowMeta.value.useAI, sampleSize: workflowMeta.value.sampleSize },
    exportState: state,
    semanticLayer: proposal.value
      ? { datasourceId: proposal.value.datasourceId, confidence: proposal.value.confidence, tables: proposal.value.tables, columns: proposal.value.columns, kpis: proposal.value.kpis, synonyms: proposal.value.synonyms, relationships: proposal.value.relationships, warnings: proposal.value.warnings }
      : { tables: semantic.layer.tables, kpis: semantic.layer.kpis, synonyms: semantic.layer.synonyms, relationships: semantic.layer.relationships }
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `semantic-layer-${selectedDatasource.value?.name || currentDatasourceId.value}-${state}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  successMessage.value = 'Couche sémantique exportée en JSON.';
  success.value = true;
};

// ─── Utils ────────────────────────────────────────────────────────────────────

const ensureValidDatasourceContext = async () => {
  if (!datasource.items.length) return;
  const valid = datasource.items.some((item) => item.id === currentDatasourceId.value);
  if (valid && currentDatasourceId.value) {
    datasource.setSelected(currentDatasourceId.value);
    await semantic.fetchLayer(currentDatasourceId.value);
    return;
  }
  const fallback = datasource.items[0].id;
  datasource.setSelected(fallback);
  await router.replace(`/semantic/${fallback}`);
  await semantic.fetchLayer(fallback);
};

const startProgress = () => {
  stopProgress();
  activeProgressStep.value = 0;
  progressTimer.value = window.setInterval(() => {
    activeProgressStep.value = Math.min(activeProgressStep.value + 1, progressSteps.length - 1);
  }, 900);
};

const stopProgress = () => {
  if (progressTimer.value) { window.clearInterval(progressTimer.value); progressTimer.value = undefined; }
  activeProgressStep.value = progressSteps.length - 1;
};

const isKpiValid = (formula: string) => {
  const trimmed = formula.trim();
  if (!trimmed) return false;
  if (/^count\s*\(\s*\*\s*\)$/i.test(trimmed)) return true;
  const keywords = new Set(['sum', 'avg', 'count', 'distinct', 'filter', 'where', 'true', 'false', 'min', 'max', 'case', 'when', 'then', 'else', 'end', 'nullif', 'coalesce', 'round', 'cast', 'as', 'numeric', 'integer', 'decimal', 'float']);
  const identifiers = trimmed.match(/[a-zA-Z_][a-zA-Z0-9_.]*/g) || [];
  return identifiers.map((id) => id.split('.').pop() || id).filter((id) => !keywords.has(id.toLowerCase())).every((id) => existingColumnNames.value.has(id));
};

const relationshipKey = (r: SemanticRelationship) => [r.fromTableTechnicalName, r.fromColumnTechnicalName, r.toTableTechnicalName, r.toColumnTechnicalName].join('::');

const tableLabel = (techName: string) => {
  const table = currentSemanticLayer.value.tables.find((t) => t.technicalName === techName);
  return table ? `${table.businessName} (${table.technicalName})` : techName;
};

const createLocalId = (prefix: string) => {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `${prefix}-${uuid}` : `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
};

const normalizeKpiFormatting = (value: string): SemanticKpiProposal['formatting'] =>
  (['currency', 'number', 'percent', 'integer'].includes(value) ? value : 'number') as SemanticKpiProposal['formatting'];

const formattingColor = (f: string) => {
  if (f === 'currency') return 'green';
  if (f === 'percent') return 'orange';
  if (f === 'integer') return 'blue';
  return 'teal';
};
</script>

<style scoped>
/* ─── Layout ─────────────────────────────────────────────────────────────── */
.semantic-generator {
  min-height: 100%;
  padding: 24px;
  background: transparent;
  color: var(--askme-ink);
}

.generator-layout {
  display: flex;
  gap: 0;
  align-items: flex-start;
  min-height: 100%;
}

.generator-main {
  flex: 1;
  min-width: 0;
  padding-right: 16px;
}

/* ─── Header ─────────────────────────────────────────────────────────────── */
.generator-header,
.control-strip,
.workflow-panel,
.progress-panel,
.table-surface,
.saved-layer,
.warning-list,
.dialog-card {
  border: 1px solid var(--askme-border);
  background: var(--askme-panel-gradient);
  box-shadow: var(--askme-shadow);
  backdrop-filter: blur(14px);
  border-radius: 8px;
  color: var(--askme-ink);
}

.generator-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  padding: 20px 22px;
  margin-bottom: 12px;
}

.eyebrow {
  margin: 0 0 4px;
  color: var(--askme-primary);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

h2, h3 { margin: 0; color: var(--askme-ink); }

.header-meta, .header-actions, .save-actions, .saved-actions, .workflow-chips { display: flex; align-items: center; gap: 8px; }
.header-meta { margin-top: 8px; flex-wrap: wrap; }
.header-actions { flex-wrap: wrap; justify-content: flex-end; }

/* ─── Control strip ──────────────────────────────────────────────────────── */
.control-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  margin-bottom: 12px;
}

.control-item { display: flex; align-items: center; }

.slider-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 200px;
  flex: 1;
}
.slider-label { font-size: 0.78rem; color: var(--askme-muted); white-space: nowrap; }

/* ─── Progress panel ─────────────────────────────────────────────────────── */
.progress-panel { padding: 16px; margin-bottom: 12px; }

.progress-steps {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.progress-step {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 20px;
  font-size: 0.76rem;
  border: 1px solid var(--askme-border);
  background: var(--askme-subtle-surface);
  color: var(--askme-muted);
  transition: background 0.2s, color 0.2s, border-color 0.2s;
}

.progress-step.active {
  color: var(--askme-primary);
  border-color: var(--askme-primary);
  background: rgba(32, 242, 182, 0.08);
}

.progress-step.done {
  color: var(--askme-primary);
  border-color: rgba(32, 242, 182, 0.3);
}

.progress-step-icon { display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; }

/* ─── Proposal summary ───────────────────────────────────────────────────── */
.proposal-summary {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 14px 20px;
  margin-bottom: 12px;
  border: 1px solid var(--askme-border);
  background: var(--askme-panel-gradient);
  border-radius: 8px;
  box-shadow: var(--askme-shadow);
}

.stat-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 70px;
}

.stat-number {
  font-size: 1.8rem;
  font-weight: 800;
  color: var(--askme-primary);
  line-height: 1;
}

.stat-label {
  font-size: 0.72rem;
  color: var(--askme-muted);
  margin-top: 2px;
}

.confidence-ring { margin-left: auto; }
.confidence-text { font-size: 0.72rem; font-weight: 700; color: var(--askme-primary); }

/* ─── Workflow panel ─────────────────────────────────────────────────────── */
.workflow-panel { padding: 16px 18px; margin-bottom: 12px; display: grid; gap: 12px; }
.workflow-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.workflow-chips { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
.workflow-steps { display: grid; gap: 8px; }
.workflow-step { display: grid; grid-template-columns: 32px 1fr auto; gap: 10px; align-items: start; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--askme-border); background: var(--askme-subtle-surface); }
.workflow-step-icon { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 999px; color: var(--askme-primary); background: rgba(32, 242, 182, 0.12); }
.workflow-step-body p { margin: 4px 0 0; color: var(--askme-muted); font-size: 0.82rem; }

/* ─── Tabs ───────────────────────────────────────────────────────────────── */
.semantic-tabs { border-bottom: 1px solid var(--askme-border); margin-top: 8px; }
.semantic-tabs :deep(.v-tab) { color: var(--askme-muted); }
.semantic-tabs :deep(.v-tab--selected) { color: var(--askme-primary); }
.tab-window { padding-top: 12px; }

.tab-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.tab-count { font-size: 0.8rem; color: var(--askme-muted); }

/* ─── Table surface ──────────────────────────────────────────────────────── */
.table-surface { overflow-x: auto; border: 1px solid var(--askme-border); border-radius: 8px; background: var(--askme-panel-gradient); }
.table-surface :deep(.v-table) { background: transparent; color: var(--askme-ink); }
.table-surface :deep(table) { min-width: 860px; }
.table-surface :deep(th) { color: var(--askme-muted); font-size: 0.72rem; text-transform: uppercase; }
.table-surface :deep(td) { color: var(--askme-ink); }

.technical { color: var(--askme-muted); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.82rem; white-space: nowrap; }
.wide-cell { min-width: 280px; }
.datatype-badge { font-size: 0.7rem; color: var(--askme-code-ink); background: var(--askme-code-bg); border-radius: 4px; padding: 2px 6px; }

/* column row enriched indicator */
.column-row--enriched { background: rgba(32, 242, 182, 0.04); }
.column-name-cell { display: flex; align-items: center; }

/* ─── KPI grid ───────────────────────────────────────────────────────────── */
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }

.kpi-card {
  border: 1px solid var(--askme-border);
  border-radius: 10px;
  background: var(--askme-panel-gradient);
  padding: 14px;
  display: grid;
  gap: 10px;
  transition: border-color 0.15s;
}

.kpi-card--valid { border-left: 3px solid #10b981; }
.kpi-card--invalid { border-left: 3px solid #ef4444; }

.kpi-card-head, .kpi-card-footer { display: flex; align-items: flex-start; gap: 8px; }
.kpi-card-title-row { display: flex; align-items: center; gap: 6px; flex: 1; }
.kpi-formula-field :deep(.v-field__input) { font-family: ui-monospace, Menlo, Monaco, monospace; font-size: 0.82rem; }
.kpi-card-footer { justify-content: space-between; align-items: center; }

.add-kpi-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 180px;
  border: 2px dashed var(--askme-border);
  border-radius: 10px;
  background: transparent;
  color: var(--askme-primary);
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.add-kpi-tile:hover { background: rgba(32, 242, 182, 0.06); border-color: var(--askme-primary); }

/* ─── Relationships ──────────────────────────────────────────────────────── */
.relationship-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); gap: 14px; }
.relationship-card { padding: 14px; border: 1px solid var(--askme-border); border-radius: 8px; background: var(--askme-panel-gradient); display: grid; gap: 12px; }
.relationship-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.relationship-path { display: grid; grid-template-columns: 1fr auto 1fr; gap: 10px; align-items: center; }
.relationship-side { padding: 10px; border: 1px solid var(--askme-border); border-radius: 6px; background: rgba(255,255,255,0.035); }
.relationship-side small, .relationship-side strong, .relationship-side code { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.relationship-side small { color: var(--askme-muted); font-size: 0.68rem; font-weight: 700; text-transform: uppercase; }
.relationship-side strong { margin-top: 3px; color: var(--askme-ink); }
.relationship-side code { margin-top: 5px; color: var(--askme-code-ink); background: var(--askme-code-bg); border-radius: 5px; padding: 3px 6px; font-size: 0.78rem; }
.relationship-footer { display: grid; gap: 6px; color: var(--askme-muted); font-size: 0.78rem; }

/* ─── Synonyms ───────────────────────────────────────────────────────────── */
.synonym-add-bar { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; margin-bottom: 14px; }
.synonym-chips-area { border: 1px solid var(--askme-border); border-radius: 8px; background: var(--askme-panel-gradient); padding: 14px; }
.area-label { margin: 0 0 10px; font-size: 0.72rem; font-weight: 700; color: var(--askme-muted); text-transform: uppercase; }
.synonym-chip-list { display: flex; flex-direction: column; gap: 6px; }
.synonym-chip-item { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid var(--askme-border); border-radius: 6px; background: var(--askme-subtle-surface); }
.synonym-chip-term { font-size: 0.82rem; font-weight: 700; color: var(--askme-primary); }
.synonym-chip-target { font-size: 0.78rem; font-family: ui-monospace, Menlo, monospace; color: var(--askme-muted); flex: 1; }
.saved-synonym-list { max-height: 400px; overflow-y: auto; }

/* ─── Confidence & Source chips ──────────────────────────────────────────── */
.confidence-chip, .source-chip { display: inline-flex; align-items: center; justify-content: center; min-width: 48px; height: 22px; border-radius: 999px; padding: 0 8px; font-size: 0.72rem; font-weight: 700; }
.confidence-chip.high { color: #58e6bd; background: rgba(28,180,132,0.16); }
.confidence-chip.medium { color: #ffd166; background: rgba(255,196,87,0.16); }
.confidence-chip.low { color: #ff8d8d; background: rgba(255,97,97,0.15); }
.source-chip.heuristic, .source-chip.metadata { color: #a6f4de; background: rgba(20,184,166,0.14); }
.source-chip.ai { color: #b6f09c; background: rgba(72,187,120,0.16); }
.source-chip.user { color: var(--askme-ink); background: var(--askme-panel-soft); }

/* ─── Save bar ───────────────────────────────────────────────────────────── */
.save-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 16px; flex-wrap: wrap; }

/* ─── Saved layer ────────────────────────────────────────────────────────── */
.saved-layer { border: 1px solid var(--askme-border); background: var(--askme-panel-gradient); border-radius: 8px; padding: 18px; }
.empty-state { display: grid; place-items: center; gap: 14px; min-height: 300px; text-align: center; }
.empty-hint { margin: 0; color: var(--askme-muted); font-size: 0.88rem; max-width: 340px; }
.saved-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
.saved-counts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.saved-technical-name { margin-left: 8px; color: var(--askme-muted); font-family: ui-monospace, Menlo, monospace; font-size: 0.8rem; }
.saved-description { margin: 0 0 10px; color: var(--askme-muted); font-size: 0.86rem; }
.saved-tabs { margin-top: 10px; }
.saved-tab-window { min-height: 200px; }

/* Saved KPI grid */
.saved-kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.saved-kpi-card { padding: 12px 14px; border: 1px solid var(--askme-border); border-radius: 8px; background: var(--askme-subtle-surface); display: grid; gap: 6px; }
.saved-kpi-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.kpi-formula-display { font-size: 0.76rem; color: var(--askme-code-ink); background: var(--askme-code-bg); border-radius: 5px; padding: 4px 8px; }
.saved-kpi-card p { margin: 0; color: var(--askme-muted); font-size: 0.8rem; }

/* ─── Dialog ─────────────────────────────────────────────────────────────── */
.dialog-card { color: var(--askme-ink); }
.confirm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }

/* ─── Deep Vuetify overrides ─────────────────────────────────────────────── */
.semantic-generator :deep(.v-field),
.semantic-generator :deep(.v-input),
.semantic-generator :deep(.v-label),
.semantic-generator :deep(.v-select__selection-text),
.semantic-generator :deep(input),
.semantic-generator :deep(textarea) { color: var(--askme-ink); }
.semantic-generator :deep(.v-field__outline), .semantic-generator :deep(.v-field__underlay) { color: var(--askme-border-strong); }

/* ─── Responsive ─────────────────────────────────────────────────────────── */
@media (max-width: 960px) {
  .semantic-generator { padding: 14px; }
  .generator-header, .save-bar, .saved-header { flex-direction: column; align-items: stretch; }
  .header-actions, .save-actions, .saved-actions, .workflow-chips { justify-content: stretch; flex-wrap: wrap; }
  .relationship-path { grid-template-columns: 1fr; }
  .control-strip { flex-direction: column; align-items: stretch; }
  .proposal-summary { flex-wrap: wrap; }
  .synonym-add-bar { flex-direction: column; }
}
</style>
