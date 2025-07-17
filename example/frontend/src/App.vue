<script setup lang="ts">
import { ref } from 'vue'
import Todo from './components/Todo.vue'
import { useOffline, stopOffline } from './feathers'

const isOffline = ref(false)
const isToggling = ref(false)

async function toggleOffline() {
  isToggling.value = true

  try {
    if (isOffline.value) {
      await stopOffline()
      isOffline.value = false
    } else {
      // Parse query string from current URL
      const urlParams = new URLSearchParams(window.location.search)
      const query: any = {}

      // Convert URLSearchParams to object
      for (const [key, value] of urlParams) {
        query[key] = value
      }

      await useOffline(query)
      isOffline.value = true
    }
  } catch (error) {
    console.error('Error toggling offline mode:', error)
  } finally {
    isToggling.value = false
  }
}
</script>

<template>
  <div class="app">
    <h1>Feathers Offline-First Todo App</h1>

    <div class="offline-controls">
      <button
        @click="toggleOffline"
        :disabled="isToggling"
        :class="{ offline: isOffline, online: !isOffline }"
        class="offline-button"
      >
        {{ isToggling ? 'Switching...' : isOffline ? 'Disable Offline' : 'Enable Offline' }}
      </button>
      <p class="status">
        Status:
        <span :class="{ offline: isOffline, online: !isOffline }">
          {{ isOffline ? 'Offline Mode' : 'Online Mode' }}
        </span>
      </p>
    </div>

    <Todo />
  </div>
</template>

<style scoped>
.app {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  text-align: center;
}

h1 {
  color: #42b883;
  margin-bottom: 30px;
}

.offline-controls {
  margin-bottom: 30px;
}

.offline-button {
  padding: 10px 20px;
  border: none;
  border-radius: 5px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
  margin-bottom: 10px;
}

.offline-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.offline-button.online {
  background-color: #42b883;
  color: white;
}

.offline-button.online:hover:not(:disabled) {
  background-color: #369870;
}

.offline-button.offline {
  background-color: #e74c3c;
  color: white;
}

.offline-button.offline:hover:not(:disabled) {
  background-color: #c0392b;
}

.status {
  font-size: 14px;
  margin: 0;
}

.status .online {
  color: #42b883;
  font-weight: bold;
}

.status .offline {
  color: #e74c3c;
  font-weight: bold;
}
</style>
