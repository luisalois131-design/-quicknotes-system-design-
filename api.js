"use strict";

const API_URL = "https://jsonplaceholder.typicode.com/posts";

const loadButton = document.getElementById("load-btn");
const noteForm = document.getElementById("note-form");
const submitButton = document.getElementById("submit-btn");
const titleInput = document.getElementById("title-input");
const bodyInput = document.getElementById("body-input");
const statusElement = document.getElementById("status");
const notesList = document.getElementById("notes-list");

const MAX_TITLE_LENGTH = 100;
const REQUEST_TIMEOUT_MS = 15000;

/**
 * Reusable HTTP request helper.
 * Throws an error when the network request fails or the response is not OK.
 */
async function request(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}.`);
    }

    // DELETE may return an empty response body.
    if (response.status === 204) {
      return { data: null, status: response.status };
    }

    const contentType = response.headers.get("content-type") || "";
    let data = null;

    if (contentType.includes("application/json")) {
      data = await response.json();
    }

    return { data, status: response.status };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("The request timed out. Please try again.");
    }

    if (error instanceof TypeError) {
      throw new Error("Unable to connect. Check your internet connection.");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Updates the status message and its visual style.
 */
function showStatus(message, type = "info") {
  statusElement.textContent = message;
  statusElement.className = `status status-${type}`;
}

/**
 * Creates the empty-list message.
 */
function showEmptyState() {
  notesList.replaceChildren();

  const item = document.createElement("li");
  item.className = "empty-state";
  item.textContent = "No notes to display. Create a note or load notes.";

  notesList.appendChild(item);
}

/**
 * Creates a note element safely.
 * User-provided text is inserted using textContent, never innerHTML.
 */
function createNoteElement(note) {
  const item = document.createElement("li");
  item.className = "note-card";
  item.dataset.noteId = String(note.id);

  const heading = document.createElement("h3");
  heading.textContent = note.title || "Untitled note";

  const body = document.createElement("p");
  body.className = "note-body";
  body.textContent = note.body || "No body provided.";

  const footer = document.createElement("div");
  footer.className = "note-footer";

  const idLabel = document.createElement("small");
  idLabel.textContent = `Note ID: ${note.id}`;

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "delete-btn";
  deleteButton.textContent = "Delete";
  deleteButton.setAttribute(
    "aria-label",
    `Delete note ${note.id}`
  );

  deleteButton.addEventListener("click", () => {
    deleteNote(note.id, item, deleteButton);
  });

  footer.append(idLabel, deleteButton);
  item.append(heading, body, footer);

  return item;
}

/**
 * Loads the first ten notes from JSONPlaceholder.
 */
async function loadNotes() {
  loadButton.disabled = true;
  showStatus("Loading notes...", "loading");

  try {
    const result = await request(`${API_URL}?_limit=10`);

    if (!Array.isArray(result.data)) {
      throw new Error("The server returned an unexpected response.");
    }

    notesList.replaceChildren();

    if (result.data.length === 0) {
      showEmptyState();
      showStatus("No notes were found.", "info");
      return;
    }

    const fragment = document.createDocumentFragment();

    result.data.forEach((note) => {
      fragment.appendChild(createNoteElement(note));
    });

    notesList.appendChild(fragment);

    showStatus(
      `Loaded ${result.data.length} notes from the server.`,
      "success"
    );
  } catch (error) {
    showStatus(
      `Could not load notes: ${error.message}`,
      "error"
    );

    if (notesList.children.length === 0) {
      showEmptyState();
    }
  } finally {
    loadButton.disabled = false;
  }
}

/**
 * Creates a note using POST.
 */
async function createNote(event) {
  event.preventDefault();

  const title = titleInput.value.trim();
  const body = bodyInput.value.trim();

  if (!title) {
    showStatus("Please enter a note title.", "error");
    titleInput.focus();
    return;
  }

  if (title.length > MAX_TITLE_LENGTH) {
    showStatus(
      "The title must not exceed 100 characters.",
      "error"
    );
    titleInput.focus();
    return;
  }

  submitButton.disabled = true;
  showStatus("Creating note...", "loading");

  try {
    const result = await request(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8"
      },
      body: JSON.stringify({
        title,
        body,
        userId: 1
      })
    });

    if (!result.data || result.data.id === undefined) {
      throw new Error("The server did not return a valid note.");
    }

    // JSONPlaceholder simulates POST requests: it returns an ID but
    // does not permanently store the new note. Keep it in the current
    // page's list only; reloading the list retrieves server seed data.
    const newNote = result.data;
    const newElement = createNoteElement(newNote);

    const firstItem = notesList.firstElementChild;

    if (
      firstItem &&
      firstItem.classList.contains("empty-state")
    ) {
      notesList.replaceChildren(newElement);
    } else {
      notesList.prepend(newElement);
    }

    showStatus(
      `Note created (status ${result.status}, id ${newNote.id}).`,
      "success"
    );

    noteForm.reset();
  } catch (error) {
    showStatus(
      `Could not create note: ${error.message}`,
      "error"
    );
  } finally {
    submitButton.disabled = false;
  }
}

/**
 * Deletes a note through DELETE.
 * JSONPlaceholder does not persist changes, so removal is reflected
 * in the current page only and may not survive a reload.
 */
async function deleteNote(noteId, noteElement, deleteButton) {
  deleteButton.disabled = true;
  showStatus(`Deleting note ${noteId}...`, "loading");

  try {
    const result = await request(`${API_URL}/${encodeURIComponent(noteId)}`, {
      method: "DELETE"
    });

    noteElement.remove();

    if (notesList.children.length === 0) {
      showEmptyState();
    }

    showStatus(
      `Note ${noteId} deleted successfully (status ${result.status}).`,
      "success"
    );
  } catch (error) {
    showStatus(
      `Could not delete note ${noteId}: ${error.message}`,
      "error"
    );

    deleteButton.disabled = false;
  } finally {
    // A successfully deleted button belongs to a removed element.
    // Re-enabling it on failure allows the user to retry.
  }
}

loadButton.addEventListener("click", loadNotes);
noteForm.addEventListener("submit", createNote);

// Show a useful initial state before the user loads any notes.
showEmptyState();