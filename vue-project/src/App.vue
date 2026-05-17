<template>
  <div class="container">
    <h1>Vue Components</h1>

    <MyButton />
  </div>
</template>

<script setup>
import MyButton from './components/MyButton.vue'
</script>

<style>
.container {
  text-align: center;
  margin-top: 100px;
}
</style>