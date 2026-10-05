const STORAGE_KEY = "unitask.tasks.v1";
const form = document.querySelector("#taskForm");
const taskList = document.querySelector("#taskList");
const emptyTemplate = document.querySelector("#emptyTemplate");
const statusLine = document.querySelector("#statusLine");
const networkStatus = document.querySelector("#networkStatus");
const filterState = document.querySelector("#filterState");
const filterPriority = document.querySelector("#filterPriority");
const totalCount = document.querySelector("#totalCount");
const pendingCount = document.querySelector("#pendingCount");
const doneCount = document.querySelector("#doneCount");

let tasks = loadTasks();

const fields = {
  title: {
    input: document.querySelector("#title"),
    error: document.querySelector("#titleError"),
    validate: (value) => {
      if (!value.trim()) return "Escribe un titulo para la tarea.";
      if (value.trim().length < 3) return "El titulo debe tener al menos 3 caracteres.";
      return "";
    },
  },
  subject: {
    input: document.querySelector("#subject"),
    error: document.querySelector("#subjectError"),
    validate: (value) => {
      if (!value.trim()) return "Indica la materia relacionada.";
      if (value.trim().length < 2) return "La materia debe tener al menos 2 caracteres.";
      return "";
    },
  },
  dueDate: {
    input: document.querySelector("#dueDate"),
    error: document.querySelector("#dateError"),
    validate: (value) => {
      if (!value) return "Selecciona una fecha limite.";
      const selected = new Date(`${value}T00:00:00`);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selected < today) return "La fecha limite debe ser hoy o futura.";
      return "";
    },
  },
};

document.addEventListener("DOMContentLoaded", () => {
  setMinimumDate();
  renderTasks();
  updateNetworkStatus();
  registerServiceWorker();
});

Object.values(fields).forEach(({ input }) => {
  input.addEventListener("input", () => validateField(input.name));
  input.addEventListener("blur", () => validateField(input.name));
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!validateForm()) {
    focusFirstInvalidField();
    setStatus("Revisa los campos marcados antes de guardar.");
    return;
  }

  const data = new FormData(form);
  const newTask = {
    id: crypto.randomUUID(),
    title: data.get("title").trim(),
    subject: data.get("subject").trim(),
    dueDate: data.get("dueDate"),
    priority: data.get("priority"),
    description: data.get("description").trim(),
    done: false,
    createdAt: new Date().toISOString(),
  };

  tasks = [newTask, ...tasks];
  saveTasks();
  form.reset();
  fields.title.input.focus();
  renderTasks();
  setStatus(`Tarea "${newTask.title}" agregada correctamente.`);
});

form.addEventListener("reset", () => {
  window.setTimeout(() => {
    Object.keys(fields).forEach(clearFieldError);
    setMinimumDate();
    setStatus("Formulario limpio.");
  }, 0);
});

taskList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const { id, action } = button.dataset;

  if (action === "toggle") {
    tasks = tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task));
    saveTasks();
    renderTasks();
    setStatus("Estado de la tarea actualizado.");
  }

  if (action === "delete") {
    const removedTask = tasks.find((task) => task.id === id);
    tasks = tasks.filter((task) => task.id !== id);
    saveTasks();
    renderTasks();
    setStatus(`Tarea "${removedTask?.title ?? "seleccionada"}" eliminada.`);
  }
});

filterState.addEventListener("change", renderTasks);
filterPriority.addEventListener("change", renderTasks);
window.addEventListener("online", updateNetworkStatus);
window.addEventListener("offline", updateNetworkStatus);

function loadTasks() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : getInitialTasks();
  } catch (error) {
    console.error("No se pudieron cargar las tareas", error);
    return getInitialTasks();
  }
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (error) {
    console.error("No se pudieron guardar las tareas", error);
    setStatus("No fue posible guardar en el navegador.");
  }
}

function getInitialTasks() {
  return [
    {
      id: crypto.randomUUID(),
      title: "Revisar HTML semantico",
      subject: "Desarrollo en plataformas",
      dueDate: getDateOffset(1),
      priority: "media",
      description: "Comprobar landmarks, encabezados y labels accesibles.",
      done: false,
      createdAt: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      title: "Probar modo offline",
      subject: "PWA",
      dueDate: getDateOffset(3),
      priority: "alta",
      description: "Instalar la app y verificar el cache del service worker.",
      done: false,
      createdAt: new Date().toISOString(),
    },
  ];
}

function validateForm() {
  const fieldResults = Object.keys(fields).map(validateField);
  const priority = form.elements.priority.value;
  const priorityError = document.querySelector("#priorityError");

  if (!priority) {
    priorityError.textContent = "Selecciona una prioridad.";
  } else {
    priorityError.textContent = "";
  }

  return fieldResults.every(Boolean) && Boolean(priority);
}

function validateField(name) {
  const field = fields[name];
  const message = field.validate(field.input.value);

  if (message) {
    field.input.setAttribute("aria-invalid", "true");
    field.input.setCustomValidity(message);
    field.error.textContent = message;
    return false;
  }

  clearFieldError(name);
  return true;
}

function clearFieldError(name) {
  const field = fields[name];
  field.input.removeAttribute("aria-invalid");
  field.input.setCustomValidity("");
  field.error.textContent = "";
}

function focusFirstInvalidField() {
  const firstInvalid = Object.values(fields).find(({ input }) => input.matches("[aria-invalid='true']"));
  firstInvalid?.input.focus();
}

function renderTasks() {
  const visibleTasks = getVisibleTasks();
  const fragment = document.createDocumentFragment();

  taskList.replaceChildren();

  if (!visibleTasks.length) {
    fragment.append(emptyTemplate.content.cloneNode(true));
  } else {
    visibleTasks.forEach((task) => fragment.append(createTaskCard(task)));
  }

  taskList.append(fragment);
  updateCounters();
  setStatus(`${visibleTasks.length} tarea(s) visibles de ${tasks.length} registradas.`);
}

function getVisibleTasks() {
  return tasks.filter((task) => {
    const matchesState =
      filterState.value === "all" ||
      (filterState.value === "pending" && !task.done) ||
      (filterState.value === "done" && task.done);
    const matchesPriority = filterPriority.value === "all" || task.priority === filterPriority.value;
    return matchesState && matchesPriority;
  });
}

function createTaskCard(task) {
  const article = document.createElement("article");
  article.className = `task-card${task.done ? " is-done" : ""}`;
  article.setAttribute("aria-labelledby", `task-title-${task.id}`);

  const content = document.createElement("div");

  const badge = document.createElement("span");
  badge.className = `badge badge-${task.priority}`;
  badge.textContent = task.priority;

  const title = document.createElement("h3");
  title.id = `task-title-${task.id}`;
  title.textContent = task.title;

  const meta = document.createElement("div");
  meta.className = "task-meta";
  meta.append(badge, document.createTextNode(`${task.subject} | vence ${formatDate(task.dueDate)}`));

  const description = document.createElement("p");
  description.textContent = task.description || "Sin descripcion adicional.";

  content.append(title, meta, description);

  const actions = document.createElement("div");
  actions.className = "task-actions";

  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.dataset.action = "toggle";
  toggleButton.dataset.id = task.id;
  toggleButton.setAttribute("aria-pressed", String(task.done));
  toggleButton.textContent = task.done ? "Reabrir" : "Completar";

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "delete-button";
  deleteButton.dataset.action = "delete";
  deleteButton.dataset.id = task.id;
  deleteButton.textContent = "Eliminar";

  actions.append(toggleButton, deleteButton);
  article.append(content, actions);

  return article;
}

function updateCounters() {
  const done = tasks.filter((task) => task.done).length;
  const pending = tasks.length - done;
  totalCount.textContent = tasks.length;
  pendingCount.textContent = pending;
  doneCount.textContent = done;
}

function setStatus(message) {
  statusLine.textContent = message;
}

function updateNetworkStatus() {
  const online = navigator.onLine;
  networkStatus.textContent = online ? "En linea" : "Modo offline";
  networkStatus.classList.toggle("is-online", online);
  networkStatus.classList.toggle("is-offline", !online);
}

function setMinimumDate() {
  fields.dueDate.input.min = getDateOffset(0);
}

function getDateOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("es-EC", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  try {
    await navigator.serviceWorker.register("service-worker.js");
  } catch (error) {
    console.error("No se pudo registrar el service worker", error);
  }
}
