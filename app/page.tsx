"use client";

import { useState, useEffect } from "react";
import "./../app/app.css";
import { Amplify } from "aws-amplify";
import outputs from "@/amplify_outputs.json";
import "@aws-amplify/ui-react/styles.css";

Amplify.configure(outputs);

const API_URL = (outputs as Record<string, unknown> & { custom?: { todoApiUrl?: string } }).custom?.todoApiUrl || "";

interface Todo {
  id: number;
  content: string;
  is_done: boolean;
  created_at: string;
  updated_at: string;
}

export default function App() {
  const [todos, setTodos] = useState<Todo[]>([]);

  async function listTodos() {
    try {
      const res = await fetch(`${API_URL}/todos`);
      const data = await res.json();
      setTodos(data);
    } catch (err) {
      console.error("Failed to fetch todos:", err);
    }
  }

  useEffect(() => {
    listTodos();
  }, []);

  async function createTodo() {
    const content = window.prompt("Todo content");
    if (!content) return;

    try {
      await fetch(`${API_URL}/todos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      listTodos();
    } catch (err) {
      console.error("Failed to create todo:", err);
    }
  }

  async function toggleTodo(todo: Todo) {
    try {
      await fetch(`${API_URL}/todos/${todo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDone: !todo.is_done }),
      });
      listTodos();
    } catch (err) {
      console.error("Failed to update todo:", err);
    }
  }

  async function deleteTodo(id: number) {
    try {
      await fetch(`${API_URL}/todos/${id}`, { method: "DELETE" });
      listTodos();
    } catch (err) {
      console.error("Failed to delete todo:", err);
    }
  }

  return (
    <main>
      <h1>My todos</h1>
      <button onClick={createTodo}>+ new</button>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>
            <input
              type="checkbox"
              checked={todo.is_done}
              onChange={() => toggleTodo(todo)}
            />
            <span style={{ textDecoration: todo.is_done ? "line-through" : "none" }}>
              {todo.content}
            </span>
            <button onClick={() => deleteTodo(todo.id)} style={{ marginLeft: 8 }}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div>
        🥳 App successfully hosted. Try creating a new todo.
      </div>
    </main>
  );
}
