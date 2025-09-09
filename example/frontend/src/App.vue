<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Todo from './components/Todo.vue'
import Login from './components/Login.vue'
import { useOffline, stopOffline, getApp, getUsername } from './feathers'

const isOffline = ref(false)
const isToggling = ref(false)
const user = ref<{ email: string; _id: string } | null>(null)
const users = ref(['robin', 'luc', 'david', 'alice'])

function updateUser(authResult: any) {
  user.value = authResult.user
}

async function toggleOffline() {
  isToggling.value = true

  try {
    if (isOffline.value) {
      await stopOffline()
      isOffline.value = false
    } else {
      await useOffline({
        username: getUsername()
      })
      isOffline.value = true
    }
  } catch (error) {
    console.error('Error toggling offline mode:', error)
  } finally {
    isToggling.value = false
  }
}

onMounted(async () => {
  const app = await getApp()

  isOffline.value = !!app.get('syncHandle')

  try {
    const authResult = await app.reAuthenticate()

    console.log(authResult.accessToken)
    user.value = authResult.user
  } catch (error) {}
})
</script>

<template>
  <div class="app" v-if="user">
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

    <div class="users-section" v-if="!isOffline">
      <h2>Switch Users</h2>
      <div class="users-list">
        <a v-for="user in users" :key="user" :href="`?username=${user}`" class="user-link">
          {{ user }}
        </a>
      </div>
    </div>

    <Todo />
  </div>
  <div class="app" v-else>
    <Login @authenticated="updateUser" />
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

.users-section {
  margin-bottom: 30px;
}

.users-section h2 {
  color: #42b883;
  margin-bottom: 15px;
  font-size: 1.2em;
}

.users-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}

.user-link {
  padding: 8px 16px;
  background-color: #f8f9fa;
  color: #42b883;
  text-decoration: none;
  border-radius: 20px;
  border: 2px solid #42b883;
  transition: all 0.3s ease;
  text-transform: capitalize;
}

.user-link:hover {
  background-color: #42b883;
  color: white;
}
</style>
