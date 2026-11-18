<template>
  <div class="datasource-workflow">
    <section class="workflow-hero">
      <div class="workflow-copy">
        <p class="eyebrow">Guided setup</p>
        <h2>Data workflow</h2>
        <span>Connectez une source, explorez le dataset, générez la couche sémantique puis analysez.</span>
      </div>
      <div class="workflow-actions">
        <v-btn size="small" variant="tonal" prepend-icon="mdi-arrow-left" to="/workspace">
          Retour
        </v-btn>
        <v-btn size="small" color="teal" prepend-icon="mdi-plus" @click="focusCreate">
          Nouvelle source
        </v-btn>
      </div>
    </section>

    <section class="stepper-shell">
      <aside class="stepper-rail">
        <button
          v-for="(step, index) in steps"
          :key="step.key"
          class="stepper-item"
          :class="{ active: activeStep === step.key, done: step.done, locked: step.locked }"
          type="button"
          :disabled="step.locked"
          @click="selectStep(step.key)"
        >
          <span class="stepper-index">
            <v-icon v-if="step.done" icon="mdi-check" size="16" />
            <span v-else>{{ index + 1 }}</span>
          </span>
          <span class="stepper-copy">
            <strong>{{ step.label }}</strong>
            <small>{{ step.caption }}</small>
          </span>
        </button>
      </aside>

      <div class="stepper-content">
        <div class="stepper-card">
          <div class="step-card-header">
            <div class="step-icon">
              <v-icon :icon="activeStepMeta.icon" size="24" />
            </div>
            <div>
              <p class="eyebrow">Etape {{ activeStepIndex + 1 }} / {{ steps.length }}</p>
              <h3>{{ activeStepMeta.title }}</h3>
              <span>{{ activeStepMeta.description }}</span>
            </div>
          </div>

          <DataSourceManager
            v-if="activeStep === 'connect'"
            @created="handleCreated"
            @selected="handleSelected"
            @tested="handleTested"
          />

          <div v-else class="step-action-panel">
            <div class="selected-source" v-if="datasource.selected">
              <v-icon icon="mdi-database-check" size="22" />
              <div>
                <strong>{{ datasource.selected.name }}</strong>
                <span>{{ datasource.selected.type.toUpperCase() }}</span>
              </div>
              <v-chip
                size="small"
                :color="datasource.selected.type === 'postgresql' ? 'teal' : 'amber'"
                variant="tonal"
                class="ml-auto"
              >
                {{ datasource.selected.type === 'postgresql' ? 'Requêtage interactif supporté' : 'Profilage uniquement' }}
              </v-chip>
            </div>

            <v-alert
              v-if="datasource.selected && datasource.selected.type !== 'postgresql' && activeStep === 'ask'"
              type="warning"
              variant="tonal"
              density="comfortable"
            >
              <strong>Attention :</strong> La source active ({{ datasource.selected.type.toUpperCase() }}) est en mode <strong>Profilage uniquement</strong>. Pour tester les requêtes analytiques avec le Copilot en direct, utilisez une connexion <strong>PostgreSQL</strong>.
            </v-alert>

            <v-alert v-else-if="!datasource.selected" type="info" variant="tonal" density="comfortable">
              Selectionne ou ajoute une source pour demarrer le parcours.
            </v-alert>

            <div v-if="activeStep === 'explore' && datasource.selected" class="schema-selector">
              <v-alert type="info" variant="tonal" density="comfortable">
                Schéma d'analyse sélectionné à la création :
                <strong>{{ selectedSchema || datasource.selected.schema || 'non defini' }}</strong>
              </v-alert>
            </div>

            <div class="step-benefits">
              <div v-for="item in activeStepMeta.benefits" :key="item">
                <v-icon icon="mdi-sparkles" size="18" />
                <span>{{ item }}</span>
              </div>
            </div>

            <v-btn
              color="primary"
              variant="flat"
              size="large"
              :prepend-icon="activeStepMeta.ctaIcon"
              :disabled="activeStepMeta.requiresDatasource && !datasource.selectedId"
              @click="runCurrentStep"
            >
              {{ activeStepMeta.cta }}
            </v-btn>
          </div>

          <footer class="stepper-actions">
            <v-btn variant="tonal" prepend-icon="mdi-arrow-left" :disabled="activeStepIndex === 0" @click="goPrev">
              Precedent
            </v-btn>
            <div class="stepper-status">
              <v-icon icon="mdi-progress-check" size="18" />
              <span>{{ progressHint }}</span>
            </div>
            <v-btn color="primary" append-icon="mdi-arrow-right" :disabled="!canProceed" @click="goNext">
              {{ nextButtonLabel }}
            </v-btn>
          </footer>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import DataSourceManager from '../../components/common/DataSourceManager.vue';
import { useDatasourceStore } from '../../stores/datasource.store';
import { useDashboardStore } from '../../stores/dashboard.store';

type WorkflowStep = 'connect' | 'explore' | 'semantic' | 'ask' | 'dashboard';
type StepDefinition = {
  key: WorkflowStep;
  label: string;
  caption: string;
  title: string;
  description: string;
  icon: string;
  cta: string;
  ctaIcon: string;
  requiresDatasource: boolean;
  benefits: string[];
  done: boolean;
  locked: boolean;
};

const route = useRoute();
const router = useRouter();
const datasource = useDatasourceStore();
const dashboard = useDashboardStore();
const selectedSchema = ref('');
const stepOrder: WorkflowStep[] = ['connect', 'explore', 'semantic', 'ask', 'dashboard'];
const WORKFLOW_STEP_KEY = 'askme_data_workflow_step';

const isWorkflowStep = (value: unknown): value is WorkflowStep =>
  typeof value === 'string' && stepOrder.includes(value as WorkflowStep);

const storedWorkflowStep = localStorage.getItem(WORKFLOW_STEP_KEY);
const initialStep = isWorkflowStep(route.query.step)
  ? route.query.step
  : isWorkflowStep(storedWorkflowStep)
    ? storedWorkflowStep
    : 'connect';
const activeStep = ref<WorkflowStep>(initialStep);

const steps = computed<StepDefinition[]>(() => {
  const hasSource = Boolean(datasource.selectedId);

  return [
    {
      key: 'connect',
      label: 'Connexion',
      caption: 'Ajouter et tester la source',
      title: 'Connecter la source de donnees',
      description: 'Cree une connexion PostgreSQL, MongoDB, CSV ou Excel puis selectionne-la pour continuer.',
      icon: 'mdi-database-plus',
      cta: 'Tester ou ajouter la source',
      ctaIcon: 'mdi-database-plus',
      requiresDatasource: false,
      benefits: ['Validation de connexion', 'Selection de la source active', 'Preparation du contexte analytics'],
      done: hasSource,
      locked: false
    },
    {
      key: 'explore',
      label: 'Explorer',
      caption: 'Tables, colonnes, preview',
      title: 'Explorer la structure du dataset',
      description: 'Passe dans Dataset Explorer pour verifier les tables, colonnes et premiers apercus.',
      icon: 'mdi-table-search',
      cta: 'Ouvrir Dataset Explorer',
      ctaIcon: 'mdi-table-search',
      requiresDatasource: true,
      benefits: ['Inventaire des tables', 'Apercu des lignes', 'Identification des champs utiles'],
      done: false,
      locked: !hasSource
    },
    {
      key: 'semantic',
      label: 'Semantique',
      caption: 'Dimensions, mesures, KPIs',
      title: 'Generer la couche semantique',
      description: 'Transforme les champs techniques en vocabulaire metier exploitable par le Copilot.',
      icon: 'mdi-shape-outline',
      cta: 'Ouvrir Semantic Layer',
      ctaIcon: 'mdi-shape-outline',
      requiresDatasource: true,
      benefits: ['Dimensions et mesures', 'Synonymes metier', 'Reduction des hallucinations SQL'],
      done: false,
      locked: !hasSource
    },
    {
      key: 'ask',
      label: 'Questions',
      caption: 'Copilot et SQL',
      title: 'Interroger les donnees avec l IA',
      description: 'Pose une question en langage naturel, verifie le SQL genere et analyse le resultat.',
      icon: 'mdi-message-text-outline',
      cta: 'Ouvrir le Workspace',
      ctaIcon: 'mdi-auto-fix',
      requiresDatasource: true,
      benefits: ['Text-to-SQL', 'Preview de requete', 'Narrative BI et insights'],
      done: false,
      locked: !hasSource
    },
    {
      key: 'dashboard',
      label: 'Dashboard',
      caption: 'Widgets et visualisations',
      title: 'Composer le dashboard final',
      description: 'Transforme les analyses en widgets sauvegardes dans un tableau de bord.',
      icon: 'mdi-chart-box-outline',
      cta: 'Ouvrir Dashboard Builder',
      ctaIcon: 'mdi-chart-box-outline',
      requiresDatasource: false,
      benefits: ['KPI cards', 'Charts interactifs', 'Layout dashboard sauvegarde'],
      done: false,
      locked: false
    }
  ];
});

const activeStepIndex = computed(() => stepOrder.indexOf(activeStep.value));

const activeStepMeta = computed(() => {
  return steps.value.find((step) => step.key === activeStep.value) || steps.value[0];
});

const canProceed = computed(() => {
  if (activeStep.value === 'connect') return Boolean(datasource.selectedId);
  return true;
});

watch(
  () => datasource.selectedId,
  (id) => {
    if (!id) {
      selectedSchema.value = '';
      activeStep.value = 'connect';
      return;
    }
    selectedSchema.value = datasource.selected?.schema || '';
  },
  { immediate: true }
);

watch(
  activeStep,
  (step) => {
    localStorage.setItem(WORKFLOW_STEP_KEY, step);
    if (route.query.step === step) return;
    void router.replace({
      query: {
        ...route.query,
        step
      }
    });
  },
  { immediate: true }
);

watch(
  () => route.query.step,
  (step) => {
    if (!isWorkflowStep(step) || step === activeStep.value) return;
    const target = steps.value.find((item) => item.key === step);
    if (target?.locked) return;
    activeStep.value = step;
  }
);

const nextButtonLabel = computed(() => {
  if (activeStep.value === 'connect') return 'Continuer';
  if (activeStep.value === 'dashboard') return 'Ouvrir dashboard';
  return 'Executer cette etape';
});

const progressHint = computed(() => {
  if (!datasource.selectedId) return 'Le parcours commence par une connexion testee et ajoutee.';
  return `${activeStepMeta.value.label} est l etape active pour ${datasource.selected?.name || 'la source selectionnee'}.`;
});

const focusCreate = () => {
  activeStep.value = 'connect';
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const selectStep = (step: WorkflowStep) => {
  const target = steps.value.find((item) => item.key === step);
  if (!target || target.locked) return;
  activeStep.value = step;
};

const handleCreated = (id: string) => {
  datasource.setSelected(id);
  selectedSchema.value = datasource.selected?.schema || '';
  activeStep.value = 'explore';
};

const handleSelected = (id: string) => {
  datasource.setSelected(id);
  selectedSchema.value = datasource.selected?.schema || '';
};

const handleTested = (ok: boolean) => {
  if (ok) activeStep.value = 'connect';
};

const goPrev = () => {
  const previous = stepOrder[activeStepIndex.value - 1];
  if (previous) activeStep.value = previous;
};

const goNext = async () => {
  if (activeStep.value === 'connect') {
    activeStep.value = 'explore';
    return;
  }

  await runCurrentStep();
};

const runCurrentStep = async () => {
  if (activeStep.value === 'explore') {
    await goDataset();
    return;
  }

  if (activeStep.value === 'semantic') {
    await goSemantic();
    return;
  }

  if (activeStep.value === 'ask') {
    await goWorkspace();
    return;
  }

  if (activeStep.value === 'dashboard') {
    await goDashboard();
  }
};

const goDataset = async () => {
  if (!datasource.selectedId) return;
  activeStep.value = 'explore';
  const schema = selectedSchema.value || datasource.selected?.schema || '';
  const query = schema ? { schema, from: 'workflow' } : { from: 'workflow' };
  await router.push({ path: `/datasets/${datasource.selectedId}`, query });
};

const goSemantic = async () => {
  if (!datasource.selectedId) return;
  activeStep.value = 'semantic';
  await router.push({ path: `/semantic/${datasource.selectedId}`, query: { from: 'workflow' } });
};

const goWorkspace = async () => {
  activeStep.value = 'ask';
  await router.push({ path: '/workspace', query: { from: 'workflow' } });
};

const goDashboard = async () => {
  activeStep.value = 'dashboard';
  if (!dashboard.current && !dashboard.items.length) {
    await dashboard.fetchAll();
  }
  const target = dashboard.current?.id || dashboard.items[0]?.id || 'main';
  await router.push(`/dashboards/${target}/edit`);
};
</script>

<style scoped>
.datasource-workflow {
  display: grid;
  gap: 12px;
}

.workflow-hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  min-height: 68px;
  max-height: 80px;
  padding: 10px 14px 10px 18px;
  border: 1px solid var(--askme-border);
  border-radius: 8px;
  background:
    rgba(255, 255, 255, 0.055);
  box-shadow: var(--askme-shadow);
  backdrop-filter: blur(22px);
}

.workflow-copy {
  min-width: 0;
}

.eyebrow {
  margin: 0 0 2px;
  color: var(--askme-secondary);
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
}

h2,
h3 {
  margin: 0;
  color: var(--askme-ink);
}

h2 {
  font-size: 22px;
  line-height: 1.15;
}

.workflow-copy span {
  display: block;
  overflow: hidden;
  margin-top: 3px;
  color: var(--askme-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
}

.stepper-shell {
  display: grid;
  grid-template-columns: minmax(260px, 340px) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.stepper-rail,
.stepper-card {
  border: 1px solid var(--askme-border);
  border-radius: 8px;
  background: var(--askme-panel-gradient);
  box-shadow: var(--askme-shadow);
  backdrop-filter: blur(22px);
}

.stepper-rail {
  position: sticky;
  top: 100px;
  display: grid;
  gap: 4px;
  padding: 14px;
}

.stepper-item {
  position: relative;
  width: 100%;
  display: grid;
  grid-template-columns: 38px 1fr;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--askme-muted);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition: transform 180ms ease, border-color 180ms ease, background 180ms ease, color 180ms ease;
}

.stepper-item:not(:last-child)::after {
  content: "";
  position: absolute;
  left: 30px;
  top: 50px;
  width: 1px;
  height: 18px;
  background: var(--askme-border);
}

.stepper-item:hover:not(:disabled) {
  transform: translateX(4px);
  background: var(--askme-hover-surface);
}

.stepper-item.active {
  color: var(--askme-ink);
  background: var(--askme-active-surface);
  border-color: var(--askme-border-strong);
  box-shadow: 0 0 34px rgba(32, 242, 182, 0.12);
}

.stepper-item.done .stepper-index {
  color: #03110d;
  background: var(--askme-primary);
  border-color: transparent;
  box-shadow: 0 0 24px rgba(32, 242, 182, 0.24);
}

.stepper-item.locked {
  cursor: not-allowed;
  opacity: 0.48;
}

.stepper-index {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 1px solid var(--askme-border);
  border-radius: 999px;
  color: var(--askme-secondary);
  background: var(--askme-subtle-surface);
  font-size: 13px;
  font-weight: 900;
}

.stepper-copy {
  display: grid;
  gap: 2px;
}

.stepper-copy strong {
  color: currentColor;
  font-size: 14px;
}

.stepper-copy small {
  color: var(--askme-muted);
  font-size: 11px;
}

.stepper-content {
  min-width: 0;
}

.stepper-card {
  display: grid;
  gap: 18px;
  padding: 18px;
}

.step-card-header {
  display: grid;
  grid-template-columns: 52px 1fr;
  gap: 14px;
  align-items: center;
  padding: 16px;
  border: 1px solid var(--askme-border);
  border-radius: 8px;
  background: var(--askme-subtle-surface);
}

.step-card-header span {
  display: block;
  margin-top: 6px;
  color: var(--askme-muted);
  font-size: 14px;
}

.step-icon {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: var(--askme-primary);
  background: rgba(32, 242, 182, 0.1);
  border: 1px solid rgba(32, 242, 182, 0.24);
  box-shadow: 0 0 30px rgba(32, 242, 182, 0.12);
}

.step-action-panel {
  display: grid;
  gap: 16px;
  padding: 18px;
  border: 1px solid var(--askme-border);
  border-radius: 8px;
  background: var(--askme-subtle-surface);
}

.step-benefits {
  display: grid;
  gap: 10px;
}

.step-benefits div {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--askme-muted);
  font-size: 14px;
}

.schema-selector {
  display: grid;
  gap: 12px;
  padding-bottom: 6px;
}

.selected-source {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 12px;
  border-radius: 8px;
  background: rgba(32, 242, 182, 0.065);
  border: 1px solid rgba(32, 242, 182, 0.22);
}

.selected-source strong,
.selected-source span {
  display: block;
}

.selected-source span {
  font-size: 12px;
  color: var(--askme-muted);
}

.stepper-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 4px;
}

.stepper-status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--askme-muted);
  font-size: 13px;
}

@media (max-width: 900px) {
  .workflow-hero {
    align-items: stretch;
    flex-direction: column;
    max-height: none;
  }

  .stepper-shell {
    grid-template-columns: 1fr;
  }

  .stepper-rail {
    position: static;
  }

  .stepper-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
