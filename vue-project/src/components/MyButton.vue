<template>
  <button @click="increase">
    Clicked {{ count }} times
  </button>
</template>

<script setup>
import { ref } from 'vue'

const count = ref(0)

function increase() {
  count.value++
}
</script>

<style scoped>
button {
  padding: 12px 20px;
  font-size: 18px;
  background: #42b883;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
}
</style>