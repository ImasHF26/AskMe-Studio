<template>
  <v-container class="fill-height auth-page" fluid>
    <v-row align="center" justify="center">
      <v-col cols="12" sm="10" md="6" lg="4">
        <v-card class="pa-6" rounded="xl">
          <h1 class="text-h5 mb-2">Create Account</h1>
          <p class="text-body-2 mb-5">Start building AI-powered dashboards</p>

          <v-text-field v-model="fullName" label="Full name" variant="outlined" class="mb-3" />
          <v-text-field v-model="email" label="Email" type="email" variant="outlined" class="mb-3" />
          <v-text-field
            v-model="password"
            label="Password"
            type="password"
            variant="outlined"
            class="mb-4"
            @keyup.enter="submit"
          />

          <v-alert v-if="auth.error" type="error" variant="tonal" class="mb-3">{{ auth.error }}</v-alert>

          <v-btn color="teal" block :loading="auth.loading" @click="submit">Register</v-btn>

          <div class="text-body-2 mt-4">
            Already have an account?
            <RouterLink to="/auth/login">Sign in</RouterLink>
          </div>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth.store';

const auth = useAuthStore();
const router = useRouter();

const fullName = ref('');
const email = ref('');
const password = ref('');

const submit = async () => {
  if (!fullName.value || !email.value || !password.value) return;

  try {
    await auth.register(fullName.value, email.value, password.value);
    await router.push('/workspace');
  } catch (error) {
    // Error state handled in store.
  }
};
</script>

<style scoped>
.auth-page {
  min-height: 100vh;
  background: radial-gradient(circle at top left, rgba(0, 168, 120, 0.15), transparent 35%),
    radial-gradient(circle at bottom right, rgba(0, 194, 168, 0.1), transparent 30%);
}
</style>
