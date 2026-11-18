<template>
  <div class="askme-composer-wrap">
    <form
      class="askme-composer"
      :class="{ focused: isFocused, loading, disabled }"
      :aria-label="t('chat.sendQuestion')"
      @submit.prevent="submit"
    >
      <div class="composer-glow" />

      <div class="composer-main">
        <button
          class="tool-button"
          type="button"
          :disabled="disabled || loading"
          :aria-label="t('chat.attachFile')"
          :title="t('chat.attachFile')"
          @click="openFilePicker"
        >
          <v-icon icon="mdi-paperclip" size="20" />
        </button>

        <v-textarea
          :model-value="modelValue"
          class="composer-input"
          :placeholder="activePlaceholder"
          variant="plain"
          rows="1"
          auto-grow
          max-rows="7"
          hide-details
          :disabled="disabled || loading"
          :aria-label="t('chat.placeholder')"
          @update:model-value="updateValue"
          @focus="isFocused = true"
          @blur="isFocused = false"
          @keydown.enter="handleEnter"
        />

        <input
          ref="fileInputRef"
          class="file-input"
          type="file"
          multiple
          aria-hidden="true"
          tabindex="-1"
          @change="handleFiles"
        />
      </div>

      <div class="composer-actions">
        <div class="left-actions">
          <button
            class="context-button"
            type="button"
            :disabled="disabled"
            :aria-label="t('chat.openDatasource')"
            :title="t('chat.openDatasource')"
            @click="emit('open-datasource')"
          >
            <v-icon icon="mdi-database-cog" size="18" />
            <span>{{ datasourceLabel }}</span>
          </button>

          <button
            class="tool-button subtle"
            type="button"
            :disabled="disabled || !hasText"
            :aria-label="t('chat.clearQuestion')"
            :title="t('chat.clearQuestion')"
            @click="clear"
          >
            <v-icon icon="mdi-broom" size="18" />
          </button>
        </div>

        <div class="shortcut-hint">
          <span>{{ t('chat.enter') }}</span>
          <small>{{ t('chat.send') }}</small>
        </div>

        <v-btn
          class="send-button"
          type="submit"
          icon
          :loading="loading"
          :disabled="disabled || !hasText"
          :aria-label="t('chat.sendQuestion')"
        >
          <v-icon icon="mdi-arrow-up" size="22" />
        </v-btn>
      </div>
    </form>

    <div class="suggestion-row" :aria-label="t('chat.suggestionsLabel')">
      <button
        v-for="suggestion in displayedSuggestions"
        :key="suggestion"
        type="button"
        :disabled="disabled || loading"
        @click="useSuggestion(suggestion)"
      >
        <v-icon icon="mdi-sparkles" size="16" />
        <span>{{ suggestion }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    loading?: boolean;
    disabled?: boolean;
    datasourceLabel?: string;
    placeholder?: string;
    suggestions?: string[];
  }>(),
  {
    loading: false,
    disabled: false,
    datasourceLabel: 'Datasource',
    placeholder: ''
  }
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  submit: [value: string];
  clear: [];
  attach: [files: File[]];
  'open-datasource': [];
}>();

const isFocused = ref(false);
const fileInputRef = ref<HTMLInputElement | null>(null);
const { t, tm } = useI18n();

const hasText = computed(() => props.modelValue.trim().length > 0);
const displayedSuggestions = computed(() => {
  return props.suggestions?.length ? props.suggestions : (tm('chat.suggestions') as string[]);
});
const activePlaceholder = computed(() => {
  if (isFocused.value) return t('chat.activePlaceholder');
  return props.placeholder || t('chat.placeholder');
});

const updateValue = (value: string) => {
  emit('update:modelValue', value);
};

const submit = () => {
  const value = props.modelValue.trim();
  if (!value || props.loading || props.disabled) return;
  emit('submit', value);
};

const handleEnter = (event: KeyboardEvent) => {
  if (event.shiftKey) return;
  event.preventDefault();
  submit();
};

const clear = () => {
  emit('update:modelValue', '');
  emit('clear');
};

const openFilePicker = () => {
  fileInputRef.value?.click();
};

const handleFiles = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const files = Array.from(target.files || []);
  if (files.length) {
    emit('attach', files);
  }
  target.value = '';
};

const useSuggestion = (suggestion: string) => {
  emit('update:modelValue', suggestion);
};
</script>

<style scoped>
.askme-composer-wrap {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  display: grid;
  gap: 10px;
}

.askme-composer {
  position: relative;
  overflow: hidden;
  display: grid;
  gap: 10px;
  padding: 14px;
  max-width: 100%;
  border: 1px solid var(--askme-border);
  border-radius: 28px;
  color: var(--askme-ink);
  background: var(--askme-panel-gradient);
  box-shadow: var(--askme-shadow), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(28px);
  transition: border-color 180ms ease, box-shadow 220ms ease, transform 180ms ease;
}

.askme-composer.focused {
  border-color: rgba(32, 242, 182, 0.58);
  box-shadow:
    0 28px 90px rgba(0, 0, 0, 0.48),
    0 0 46px rgba(32, 242, 182, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
  transform: translateY(-1px);
}

.askme-composer.loading {
  border-color: rgba(110, 231, 216, 0.44);
}

.askme-composer.disabled {
  opacity: 0.68;
}

.composer-glow {
  position: absolute;
  inset: auto 12% -55% 12%;
  height: 120px;
  pointer-events: none;
  background: radial-gradient(circle, rgba(32, 242, 182, 0.24), transparent 68%);
  opacity: 0;
  filter: blur(18px);
  transition: opacity 220ms ease;
}

.askme-composer.focused .composer-glow,
.askme-composer.loading .composer-glow {
  opacity: 1;
}

.composer-main,
.composer-actions,
.left-actions,
.context-button,
.shortcut-hint {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
}

.composer-main {
  gap: 10px;
  align-items: flex-start;
}

.composer-input {
  flex: 1;
  min-width: 0;
}

.composer-input :deep(.v-field) {
  background: transparent !important;
  box-shadow: none !important;
}

.composer-input :deep(.v-field__input) {
  align-items: flex-start;
  min-height: 50px !important;
  max-height: 10rem;
  padding: 15px 0 !important;
  color: var(--askme-ink) !important;
  overflow-y: auto !important;
}

.composer-input :deep(textarea) {
  max-height: 9rem;
  min-height: 46px;
  overflow-y: auto !important;
  resize: none;
  color: var(--askme-ink) !important;
  line-height: 1.72;
  font-size: 1rem;
  font-weight: 520;
  scrollbar-width: thin;
}

.composer-input :deep(textarea::placeholder) {
  color: var(--askme-muted) !important;
  opacity: 0.82 !important;
  transition: opacity 180ms ease, transform 180ms ease;
}

.askme-composer.focused .composer-input :deep(textarea::placeholder) {
  opacity: 0.55 !important;
  transform: translateX(2px);
}

.composer-input :deep(textarea::-webkit-scrollbar) {
  width: 6px;
}

.composer-input :deep(textarea::-webkit-scrollbar-thumb) {
  border-radius: 999px;
  background: rgba(32, 242, 182, 0.36);
}

.composer-actions {
  justify-content: space-between;
  gap: 12px;
}

.left-actions {
  min-width: 0;
  gap: 8px;
}

.tool-button,
.context-button {
  border: 1px solid rgba(151, 255, 221, 0.13);
  color: var(--askme-muted);
  background: rgba(255, 255, 255, 0.055);
  cursor: pointer;
  transition: transform 160ms ease, color 160ms ease, border-color 160ms ease, background 160ms ease;
}

.tool-button {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 999px;
}

.tool-button.subtle {
  width: 34px;
  height: 34px;
}

.context-button {
  min-width: 0;
  max-width: 280px;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 0.875rem;
  font-weight: 800;
}

.context-button span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tool-button:hover:not(:disabled),
.context-button:hover:not(:disabled) {
  transform: translateY(-1px);
  color: var(--askme-ink);
  border-color: rgba(32, 242, 182, 0.4);
  background: rgba(32, 242, 182, 0.1);
}

.tool-button:disabled,
.context-button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.shortcut-hint {
  gap: 6px;
  color: var(--askme-faint);
  font-size: 0.75rem;
}

.shortcut-hint span {
  padding: 3px 7px;
  border: 1px solid rgba(151, 255, 221, 0.14);
  border-radius: 7px;
  color: var(--askme-muted);
  background: rgba(255, 255, 255, 0.045);
}

.send-button {
  width: 42px !important;
  height: 42px !important;
  flex: 0 0 auto;
  border-radius: 999px !important;
  color: #03110d !important;
  background: linear-gradient(135deg, #20f2b6, #6ee7d8) !important;
  box-shadow: 0 0 28px rgba(32, 242, 182, 0.34) !important;
  transition: transform 160ms ease, box-shadow 160ms ease, opacity 160ms ease;
}

.send-button:hover:not(.v-btn--disabled) {
  transform: translateY(-2px) scale(1.03);
  box-shadow: 0 0 42px rgba(32, 242, 182, 0.52) !important;
}

.send-button.v-btn--disabled {
  color: var(--askme-muted) !important;
  background: rgba(255, 255, 255, 0.08) !important;
  box-shadow: none !important;
}

.file-input {
  display: none;
}

.suggestion-row {
  display: flex;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 0 8px;
}

.suggestion-row button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 34px;
  padding: 7px 12px;
  border: 1px solid rgba(151, 255, 221, 0.13);
  border-radius: 999px;
  color: var(--askme-muted);
  background: rgba(255, 255, 255, 0.045);
  font-size: 0.875rem;
  font-weight: 760;
  cursor: pointer;
  backdrop-filter: blur(18px);
  transition: transform 160ms ease, color 160ms ease, border-color 160ms ease, background 160ms ease;
}

.suggestion-row button:hover:not(:disabled) {
  transform: translateY(-2px);
  color: var(--askme-ink);
  border-color: rgba(32, 242, 182, 0.36);
  background: rgba(32, 242, 182, 0.09);
}

.suggestion-row button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

@media (max-width: 760px) {
  .askme-composer {
    border-radius: 24px;
    padding: 12px;
  }

  .composer-main {
    gap: 8px;
  }

  .composer-actions {
    align-items: flex-end;
  }

  .shortcut-hint {
    display: none;
  }

  .context-button {
    max-width: 180px;
  }

  .suggestion-row {
    justify-content: flex-start;
    overflow-x: auto;
    flex-wrap: nowrap;
    padding-bottom: 2px;
  }

  .suggestion-row button {
    flex: 0 0 auto;
  }
}
</style>
