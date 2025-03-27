<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { app, type TodoItem } from '../feathers'

const newTodo = ref('')
const todos = ref<TodoItem[]>([])

onMounted(async () => {
  const result = await app.service('todos').find()
  todos.value = result
})

const addTodo = async () => {
  if (newTodo.value.trim()) {
    await app.service('todos').create({
      title: newTodo.value,
      completed: false
    })
    newTodo.value = ''
  }
}

const toggleTodo = async (todo: TodoItem) => {
  await app.service('todos').patch(todo.id, {
    completed: !todo.completed
  })
}

const removeTodo = async (id: string) => {
  await app.service('todos').remove(id)
}

app.service('todos').on('created', (created: TodoItem) => {
  todos.value.push(created)
})

app.service('todos').on('patched', (patched: TodoItem) => {
  const index = todos.value.findIndex(t => t.id === patched.id)
  if (index !== -1) {
    todos.value[index] = patched
  }
})

app.service('todos').on('removed', (removed: TodoItem) => {
  todos.value = todos.value.filter(todo => todo.id !== removed.id)
})
</script>

<template>
  <div class="todo-container">
    <h2>Todo List</h2>
    <div class="input-group">
      <input v-model="newTodo" @keyup.enter="addTodo" placeholder="Add a new todo" type="text">
      <button @click="addTodo">Add</button>
    </div>
    <ul class="todo-list">
      <li v-for="todo in todos" :key="todo.id" :class="{ completed: todo.completed }">
        <input type="checkbox" :checked="todo.completed" @change="toggleTodo(todo)">
        <span class="todo-text">{{ todo.title }}</span>
        <button class="delete-btn" @click="removeTodo(todo.id)">Delete</button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.todo-container {
  max-width: 500px;
  margin: 0 auto;
  padding: 20px;
}

.input-group {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

input[type="text"] {
  flex: 1;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

button {
  padding: 8px 16px;
  background-color: #42b883;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:hover {
  background-color: #3aa876;
}

.todo-list {
  list-style: none;
  padding: 0;
}

.todo-list li {
  display: flex;
  align-items: center;
  padding: 8px;
  border-bottom: 1px solid #eee;
  gap: 10px;
}

.todo-list li.completed span {
  text-decoration: line-through;
  color: #999;
}

.delete-btn {
  background-color: #ff4444;
  padding: 4px 8px;
  margin-left: auto;
}

.delete-btn:hover {
  background-color: #cc3333;
}
</style>
