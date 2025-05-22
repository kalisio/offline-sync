<script setup lang="ts">
import Todo from './components/Todo.vue'
</script>

<template>
  <div class="app">
    <h1>Feathers Offline-First Todo App</h1>
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
</style>
