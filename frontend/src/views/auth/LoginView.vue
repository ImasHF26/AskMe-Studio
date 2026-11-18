<template>
  <main class="auth-page">
    <section class="brand-panel" aria-label="AskMe Studio">
      <img class="brand-screenshot" :src="heroScreenshot" alt="" aria-hidden="true" />
      <div class="brand-shade" aria-hidden="true"></div>

      <div class="brand-content">
        <img class="brand-logo" :src="brandLogo" alt="AskMe Studio" />

        <div class="brand-copy">
          <p class="brand-kicker">Generative Business Intelligence</p>
          <h1>Interrogez vos données en langage naturel</h1>
          <p class="brand-subtitle">
            Plateforme de Generative Business Intelligence alimentée par l'Intelligence Artificielle.
          </p>
        </div>

        <ul class="feature-list" aria-label="Fonctionnalités AskMe Studio">
          <li v-for="feature in features" :key="feature">
            <v-icon icon="mdi-check" size="18" />
            <span>{{ feature }}</span>
          </li>
        </ul>

        <p class="brand-footer">De la donnée brute à la décision assistée par l'IA</p>
      </div>
    </section>

    <section class="login-panel" aria-label="Connexion">
      <div class="login-card">
        <div class="login-header">
          <p class="login-eyebrow">AskMe Studio</p>
          <h2>Connexion</h2>
          <p>Accédez à votre espace AskMe Studio</p>
        </div>

        <form class="login-form" @submit.prevent="submit">
          <v-text-field
            v-model="email"
            autocomplete="email"
            bg-color="transparent"
            class="auth-field"
            color="primary"
            density="comfortable"
            hide-details="auto"
            label="Adresse e-mail"
            prepend-inner-icon="mdi-email-outline"
            type="email"
            variant="outlined"
          />

          <v-text-field
            v-model="password"
            :append-inner-icon="showPassword ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="current-password"
            bg-color="transparent"
            class="auth-field"
            color="primary"
            density="comfortable"
            hide-details="auto"
            label="Mot de passe"
            prepend-inner-icon="mdi-lock-outline"
            variant="outlined"
            @click:append-inner="showPassword = !showPassword"
          />

          <div class="form-options">
            <v-checkbox
              v-model="rememberMe"
              class="remember-check"
              color="primary"
              density="compact"
              hide-details
              label="Se souvenir de moi"
            />

            <a class="forgot-link" href="#" @click.prevent>Mot de passe oublié</a>
          </div>

          <div class="demo-account-hint" @click="fillDemo">
            <v-icon icon="mdi-information-outline" size="16" class="mr-1" />
            <span>Compte démo : <strong>demo@askme.studio</strong> / <strong>password123</strong></span>
            <span class="demo-click-action">(Cliquer pour remplir)</span>
          </div>

          <v-alert v-if="auth.error" class="auth-alert" type="error" variant="tonal">
            <div>{{ auth.error }}</div>
            <div v-if="email === 'demo@askme.studio'" class="mt-2 text-caption">
              Mot de passe démo attendu : <strong style="color: var(--askme-primary)">password123</strong>
              <span class="ml-2" style="cursor: pointer; text-decoration: underline;" @click="fillDemo">
                Réinitialiser à password123
              </span>
            </div>
          </v-alert>

          <v-btn
            block
            class="primary-action"
            color="primary"
            :disabled="!canSubmit"
            :loading="auth.loading"
            size="large"
            type="submit"
          >
            Se connecter
          </v-btn>

          <v-btn block class="secondary-action" size="large" to="/auth/register" variant="outlined">
            Créer un compte
          </v-btn>
        </form>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import brandLogo from '../../../assets/images/logo_charte_graphique_dark.png';
import heroScreenshot from '../../../assets/images/screenshots/home-askme-studio.png';
import { useAuthStore } from '../../stores/auth.store';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const email = ref('demo@askme.studio');
const password = ref('password123');
const rememberMe = ref(true);
const showPassword = ref(false);

const features = [
  'Analyse conversationnelle',
  'Couche sémantique métier',
  'Génération SQL assistée par IA',
  'Dashboards interactifs',
  'Gouvernance des données'
];

const canSubmit = computed(() => Boolean(email.value && password.value));

const fillDemo = () => {
  email.value = 'demo@askme.studio';
  password.value = 'password123';
  showPassword.value = true;
};

const submit = async () => {
  if (!canSubmit.value) return;

  try {
    await auth.login(email.value, password.value);
    const redirect = Array.isArray(route.query.redirect) ? route.query.redirect[0] : route.query.redirect;
    await router.push(redirect || '/workspace');
  } catch (error) {
    // Error state handled in store.
  }
};
</script>

<style scoped>
.auth-page {
  --auth-ink: var(--askme-ink);
  --auth-muted: var(--askme-muted);
  --auth-faint: var(--askme-faint);
  --auth-panel: color-mix(in srgb, var(--askme-panel-strong) 86%, transparent);
  --auth-field: color-mix(in srgb, var(--askme-bg-2) 62%, transparent);
  --auth-border: var(--askme-border);
  --auth-border-strong: var(--askme-border-strong);
  --auth-primary: var(--askme-primary);
  --auth-secondary: var(--askme-secondary);
  --auth-blue: var(--askme-blue);
  --auth-shadow: var(--askme-shadow);
  display: grid;
  grid-template-columns: minmax(0, 55fr) minmax(420px, 45fr);
  height: 100vh;
  min-height: 100vh;
  overflow: hidden;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--askme-bg) 94%, var(--askme-primary) 6%), var(--askme-bg-2));
  color: var(--auth-ink);
}

.brand-panel,
.login-panel {
  position: relative;
  min-height: 100vh;
}

.brand-panel {
  display: flex;
  align-items: stretch;
  isolation: isolate;
  overflow: hidden;
  color: #eefcf8;
  background: #03070d;
}

.brand-screenshot {
  position: absolute;
  inset: -18px;
  z-index: -3;
  width: calc(100% + 36px);
  height: calc(100% + 36px);
  object-fit: cover;
  object-position: 42% center;
  filter: blur(5px) saturate(1.08);
  opacity: 0.82;
  transform: scale(1.02);
}

.brand-shade {
  position: absolute;
  inset: 0;
  z-index: -2;
  background:
    linear-gradient(90deg, rgba(3, 7, 13, 0.88) 0%, rgba(3, 7, 13, 0.7) 48%, rgba(3, 7, 13, 0.4) 100%),
    linear-gradient(180deg, rgba(3, 7, 13, 0.28) 0%, rgba(3, 7, 13, 0.72) 100%),
    linear-gradient(135deg, rgba(32, 242, 182, 0.16), rgba(103, 232, 249, 0.08) 44%, rgba(3, 7, 13, 0.2));
}

.brand-panel::after {
  position: absolute;
  inset: 0;
  z-index: -1;
  border-right: 1px solid rgba(151, 255, 221, 0.16);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.05), transparent 32%);
  content: "";
  pointer-events: none;
}

.brand-content {
  display: flex;
  width: min(100%, 760px);
  min-height: 100vh;
  flex-direction: column;
  justify-content: space-between;
  padding: clamp(32px, 5vw, 68px);
}

.brand-logo {
  width: min(320px, 68vw);
  height: auto;
  object-fit: contain;
}

.brand-copy {
  max-width: 680px;
  margin-block: auto;
  padding-block: clamp(48px, 8vh, 92px);
}

.brand-kicker {
  margin: 0 0 18px;
  color: var(--auth-secondary);
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.brand-copy h1 {
  max-width: 680px;
  margin: 0;
  color: #ffffff;
  font-size: clamp(2.45rem, 5.5vw, 5rem);
  font-weight: 800;
  letter-spacing: 0;
  line-height: 0.96;
}

.brand-subtitle {
  max-width: 620px;
  margin: 24px 0 0;
  color: rgba(238, 252, 248, 0.76);
  font-size: clamp(1rem, 1.5vw, 1.2rem);
  line-height: 1.7;
}

.feature-list {
  display: grid;
  max-width: 600px;
  margin: 0;
  padding: 0;
  gap: 12px;
  list-style: none;
}

.feature-list li {
  display: flex;
  align-items: center;
  gap: 12px;
  color: rgba(238, 252, 248, 0.86);
  font-size: 0.98rem;
  line-height: 1.35;
}

.feature-list :deep(.v-icon) {
  display: grid;
  width: 26px;
  height: 26px;
  flex: 0 0 26px;
  place-items: center;
  border: 1px solid rgba(32, 242, 182, 0.38);
  border-radius: 999px;
  background: rgba(32, 242, 182, 0.14);
  color: var(--auth-primary);
  box-shadow: 0 0 24px rgba(32, 242, 182, 0.14);
}

.brand-footer {
  margin: clamp(32px, 6vh, 56px) 0 0;
  color: rgba(238, 252, 248, 0.68);
  font-size: 0.96rem;
}

.login-panel {
  display: grid;
  align-items: center;
  padding: clamp(24px, 5vw, 72px);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--askme-panel-soft) 60%, transparent), transparent 42%),
    linear-gradient(135deg, color-mix(in srgb, var(--askme-bg) 92%, var(--askme-primary) 8%), var(--askme-bg-2));
}

.login-card {
  width: min(100%, 480px);
  margin: 0 auto;
  padding: clamp(28px, 4.5vw, 48px);
  border: 1px solid var(--auth-border);
  border-radius: 8px;
  background:
    linear-gradient(145deg, color-mix(in srgb, var(--auth-panel) 94%, white 6%), var(--auth-panel)),
    var(--auth-panel);
  box-shadow: var(--auth-shadow), 0 0 0 1px rgba(255, 255, 255, 0.03) inset;
  backdrop-filter: blur(24px);
}

.login-header {
  margin-bottom: 34px;
}

.login-eyebrow {
  margin: 0 0 12px;
  color: var(--auth-primary);
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.login-header h2 {
  margin: 0;
  color: var(--auth-ink);
  font-size: clamp(2rem, 4vw, 2.8rem);
  font-weight: 800;
  letter-spacing: 0;
  line-height: 1;
}

.login-header p:not(.login-eyebrow) {
  margin: 14px 0 0;
  color: var(--auth-muted);
  font-size: 1rem;
  line-height: 1.55;
}

.login-form {
  display: grid;
  gap: 18px;
}

.auth-field {
  transition:
    transform 180ms ease,
    filter 180ms ease;
}

.auth-field:hover {
  transform: translateY(-1px);
}

.auth-field :deep(.v-field) {
  border-radius: 8px;
  background: var(--auth-field);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.05) inset;
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease,
    background 180ms ease;
}

.auth-field :deep(.v-field--focused) {
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--auth-primary) 18%, transparent),
    0 12px 32px color-mix(in srgb, var(--auth-primary) 14%, transparent);
}

.auth-field :deep(.v-label),
.auth-field :deep(.v-field__prepend-inner),
.auth-field :deep(.v-field__append-inner) {
  color: var(--auth-muted);
}

.auth-field :deep(.v-field__input) {
  color: var(--auth-ink);
}

.form-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-top: -4px;
}

.remember-check {
  margin-inline-start: -10px;
  color: var(--auth-muted);
}

.remember-check :deep(.v-label) {
  color: var(--auth-muted);
  font-size: 0.92rem;
  opacity: 1;
}

.forgot-link {
  flex: 0 0 auto;
  color: var(--auth-secondary);
  font-size: 0.92rem;
  font-weight: 700;
  text-decoration: none;
  transition:
    color 180ms ease,
    opacity 180ms ease;
}

.forgot-link:hover,
.forgot-link:focus-visible {
  color: var(--auth-primary);
  opacity: 0.88;
}

.demo-account-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--auth-primary) 10%, transparent);
  border: 1px dashed color-mix(in srgb, var(--auth-primary) 30%, transparent);
  color: var(--auth-ink);
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 180ms ease;
}

.demo-account-hint:hover {
  background: color-mix(in srgb, var(--auth-primary) 18%, transparent);
  border-color: var(--auth-primary);
}

.demo-click-action {
  color: var(--auth-primary);
  font-weight: 600;
  text-decoration: underline;
}

.auth-alert {
  border-radius: 8px;
}

.primary-action,
.secondary-action {
  border-radius: 8px;
  font-weight: 800;
  letter-spacing: 0;
  text-transform: none;
  transition:
    transform 180ms ease,
    box-shadow 180ms ease,
    border-color 180ms ease,
    background 180ms ease;
}

.primary-action {
  min-height: 52px;
  box-shadow: 0 16px 36px color-mix(in srgb, var(--auth-primary) 24%, transparent);
}

.primary-action:hover {
  transform: translateY(-2px);
  box-shadow: 0 20px 44px color-mix(in srgb, var(--auth-primary) 30%, transparent);
}

.secondary-action {
  min-height: 52px;
  margin-top: 2px;
  border-color: var(--auth-border-strong);
  color: var(--auth-ink);
}

.secondary-action:hover {
  transform: translateY(-1px);
  border-color: var(--auth-primary);
  background: color-mix(in srgb, var(--auth-primary) 9%, transparent);
}

@media (prefers-reduced-motion: no-preference) {
  .brand-screenshot {
    animation: screenshot-drift 18s ease-in-out infinite alternate;
  }

  .login-card {
    animation: card-arrival 520ms ease both;
  }
}

@keyframes screenshot-drift {
  from {
    transform: scale(1.02) translate3d(-6px, 0, 0);
  }

  to {
    transform: scale(1.045) translate3d(8px, -4px, 0);
  }
}

@keyframes card-arrival {
  from {
    opacity: 0;
    transform: translateY(14px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 1100px) {
  .auth-page {
    height: auto;
    grid-template-columns: minmax(0, 1fr);
    overflow: auto;
  }

  .brand-panel,
  .login-panel {
    min-height: auto;
  }

  .brand-content {
    width: 100%;
    min-height: 56vh;
  }

  .brand-copy {
    padding-block: clamp(44px, 7vh, 72px);
  }

  .brand-panel::after {
    border-right: 0;
    border-bottom: 1px solid rgba(151, 255, 221, 0.16);
  }

  .login-panel {
    min-height: 44vh;
  }
}

@media (max-width: 640px) {
  .auth-page {
    background: var(--askme-bg);
  }

  .brand-content {
    min-height: 60vh;
    padding: 24px;
  }

  .brand-logo {
    width: min(230px, 72vw);
  }

  .brand-copy {
    padding-block: 44px;
  }

  .brand-copy h1 {
    font-size: clamp(2.2rem, 14vw, 3.6rem);
    line-height: 1;
  }

  .feature-list {
    gap: 10px;
  }

  .feature-list li {
    font-size: 0.92rem;
  }

  .brand-footer {
    margin-top: 28px;
  }

  .login-panel {
    padding: 20px;
  }

  .login-card {
    padding: 24px;
  }

  .form-options {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }

  .forgot-link {
    padding-left: 2px;
  }
}
</style>
