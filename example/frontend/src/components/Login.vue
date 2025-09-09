<script setup lang="ts">
import { ref } from 'vue'
import { getApp } from '../feathers'

const emit = defineEmits(['authenticated'])

const email = ref('')
const password = ref('')
const isSignup = ref(false)
const loading = ref(false)
const error = ref('')

function toggleMode() {
  isSignup.value = !isSignup.value
  error.value = ''
}

async function handleSubmit() {
  loading.value = true
  error.value = ''

  try {
    const app = await getApp()

    if (isSignup.value) {
      // Create user first
      await app.service('users').create({
        email: email.value,
        password: password.value
      })
    }

    // Authenticate
    const response = await app.authenticate({
      strategy: 'local',
      email: email.value,
      password: password.value
    })

    emit('authenticated', response)
  } catch (err: any) {
    error.value = err.message || 'Authentication failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-container">
    <div class="login-form">
      <h2>{{ isSignup ? 'Sign Up' : 'Login' }}</h2>

      <form @submit.prevent="handleSubmit">
        <div class="form-group">
          <label for="email">Email</label>
          <input
            id="email"
            v-model="email"
            type="email"
            required
            :disabled="loading"
            placeholder="Enter your email"
          />
        </div>

        <div class="form-group">
          <label for="password">Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            required
            :disabled="loading"
            placeholder="Enter your password"
          />
        </div>

        <div class="form-actions">
          <button type="submit" :disabled="loading" class="submit-btn">
            {{ loading ? 'Processing...' : isSignup ? 'Sign Up' : 'Login' }}
          </button>
        </div>
      </form>

      <div class="form-footer">
        <button @click="toggleMode" :disabled="loading" class="toggle-btn">
          {{ isSignup ? 'Already have an account? Login' : "Don't have an account? Sign up" }}
        </button>
      </div>

      <div v-if="error" class="error-message">
        {{ error }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 20px;
  min-width: 400px;
}

.login-form {
  background: white;
  padding: 40px;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  width: 100%;
  max-width: 400px;
}

h2 {
  color: #42b883;
  text-align: center;
  margin-bottom: 30px;
}

.form-group {
  margin-bottom: 20px;
}

label {
  display: block;
  margin-bottom: 5px;
  color: #333;
  font-weight: 500;
}

input {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 16px;
  transition: border-color 0.3s ease;
  box-sizing: border-box;
}

input:focus {
  outline: none;
  border-color: #42b883;
}

input:disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
}

.form-actions {
  margin-bottom: 20px;
}

.submit-btn {
  width: 100%;
  padding: 12px;
  background-color: #42b883;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.3s ease;
}

.submit-btn:hover:not(:disabled) {
  background-color: #369870;
}

.submit-btn:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.form-footer {
  text-align: center;
}

.toggle-btn {
  background: none;
  border: none;
  color: #42b883;
  cursor: pointer;
  text-decoration: underline;
  font-size: 14px;
}

.toggle-btn:hover:not(:disabled) {
  color: #369870;
}

.toggle-btn:disabled {
  color: #ccc;
  cursor: not-allowed;
}

.error-message {
  margin-top: 15px;
  padding: 10px;
  background-color: #fee;
  color: #c33;
  border-radius: 4px;
  text-align: center;
  font-size: 14px;
}
</style>
