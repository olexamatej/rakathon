"use strict";

const utf8 = new TextEncoder();

function toBase64Url(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Neplatný formát dešifrovacího klíče.");
  }
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  let binary;
  try {
    binary = atob(padded);
  } catch {
    throw new Error("Neplatný formát dešifrovacího klíče.");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function apiError(response) {
  if (response.status === 404) return "Přenos nebyl nalezen, vypršel nebo už byl vyzvednut.";
  if (response.status === 429) return "Příliš mnoho pokusů. Počkejte chvíli a zkuste to znovu.";
  if (response.status === 503) return "Služba je dočasně nedostupná. Zkuste to později.";
  if (response.status === 413) return "Seznam je příliš velký.";
  if (response.status === 400) return "Zadané údaje nejsou ve správném formátu.";
  return "Požadavek se nepodařilo dokončit.";
}

function setStatus(element, message, kind = "") {
  element.textContent = message;
  element.className = `status${kind ? ` ${kind}` : ""}`;
}

function setupCopyButtons() {
  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const output = document.getElementById(button.dataset.copy);
      const value = output?.textContent?.trim();
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        button.textContent = "Zkopírováno";
        window.setTimeout(() => { button.textContent = "Kopírovat"; }, 1500);
      } catch {
        button.textContent = "Označte a zkopírujte";
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(output);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    });
  });
}

function setupPatient() {
  const fileInput = document.getElementById("medication-file");
  const jsonInput = document.getElementById("medication-json");
  const uploadButton = document.getElementById("upload-button");
  const status = document.getElementById("patient-status");
  const result = document.getElementById("transfer-result");
  const revokeButton = document.getElementById("revoke-button");
  let activeTransfer = null;

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      jsonInput.value = await file.text();
      setStatus(status, `Načten soubor ${file.name}. Zatím zůstává v tomto prohlížeči.`, "success");
    } catch {
      setStatus(status, "Soubor se nepodařilo načíst.", "error");
    }
  });

  uploadButton.addEventListener("click", async () => {
    uploadButton.disabled = true;
    result.hidden = true;
    setStatus(status, "Šifruji seznam v prohlížeči a nahrávám obal…");
    try {
      let medicationList;
      try {
        medicationList = JSON.parse(jsonInput.value);
      } catch {
        throw new Error("Vložený seznam není platný JSON.");
      }
      if (!medicationList || typeof medicationList !== "object" || Array.isArray(medicationList)
          || !Array.isArray(medicationList.medications)) {
        throw new Error("JSON musí být objekt s polem medications.");
      }

      const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
      const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));
      const nonce = crypto.getRandomValues(new Uint8Array(12));
      const plaintext = utf8.encode(JSON.stringify(medicationList));
      const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plaintext));
      const decryptionKey = toBase64Url(rawKey);
      rawKey.fill(0);

      const response = await fetch("/v1/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          expiresInSeconds: Number(document.getElementById("expires").value),
          envelope: {
            format: "pillgaze.medication-list",
            formatVersion: 1,
            algorithm: "A256GCM",
            nonce: toBase64Url(nonce),
            ciphertext: toBase64Url(ciphertext),
          },
        }),
      });
      if (!response.ok) throw new Error(await apiError(response));
      const transfer = await response.json();
      activeTransfer = transfer;
      document.getElementById("result-pin").textContent = transfer.retrievalCode;
      document.getElementById("result-key").textContent = decryptionKey;
      document.getElementById("expires-at").textContent = `Platnost do ${new Date(transfer.expiresAt).toLocaleString("cs-CZ")}.`;
      result.hidden = false;
      setStatus(status, "Seznam byl zašifrován a bezpečně uložen.", "success");
    } catch (error) {
      setStatus(status, error instanceof Error ? error.message : "Nahrání se nezdařilo.", "error");
    } finally {
      uploadButton.disabled = false;
    }
  });

  revokeButton.addEventListener("click", async () => {
    if (!activeTransfer) return;
    revokeButton.disabled = true;
    try {
      const response = await fetch(`/v1/transfers/${encodeURIComponent(activeTransfer.transferId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${activeTransfer.revocationToken}` },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(await apiError(response));
      activeTransfer = null;
      result.hidden = true;
      setStatus(status, "Sdílení bylo zrušeno.", "success");
    } catch (error) {
      setStatus(status, error instanceof Error ? error.message : "Přenos se nepodařilo zrušit.", "error");
      revokeButton.disabled = false;
    }
  });
}

function renderMedicationList(container, payload) {
  container.replaceChildren();
  const medications = payload && Array.isArray(payload.medications) ? payload.medications : null;
  if (!medications) {
    const pre = document.createElement("pre");
    pre.className = "json-output";
    pre.textContent = JSON.stringify(payload, null, 2);
    container.append(pre);
    return;
  }
  if (medications.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "Seznam neobsahuje žádné léky.";
    container.append(empty);
    return;
  }

  const list = document.createElement("ol");
  list.className = "medicine-list";
  medications.forEach((medicine) => {
    const row = document.createElement("li");
    row.className = "medicine-item";
    const title = document.createElement("strong");
    title.textContent = typeof medicine?.name === "string" ? medicine.name : "Položka seznamu";
    row.append(title);
    const details = [medicine?.strength, medicine?.dose, medicine?.schedule]
      .filter((value) => typeof value === "string" && value.trim());
    if (details.length) {
      const description = document.createElement("p");
      description.textContent = details.join(" · ");
      row.append(description);
    }
    list.append(row);
  });
  container.append(list);
}

function setupDoctor() {
  const codeInput = document.getElementById("retrieval-code");
  const keyInput = document.getElementById("decryption-key");
  const button = document.getElementById("redeem-button");
  const status = document.getElementById("doctor-status");
  const result = document.getElementById("medication-result");
  const content = document.getElementById("medication-content");
  let lastCode = "";
  let lastIdempotencyKey = "";

  button.addEventListener("click", async () => {
    const code = codeInput.value.trim().toUpperCase();
    const keyText = keyInput.value.trim();
    result.hidden = true;
    button.disabled = true;
    setStatus(status, "Vyzvedávám šifrovaný obal…");
    try {
      if (!/^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{12}$/.test(code)) {
        throw new Error("PIN musí mít 12 znaků.");
      }
      const rawKey = fromBase64Url(keyText);
      if (rawKey.length !== 32) {
        rawKey.fill(0);
        throw new Error("Dešifrovací klíč nemá správnou délku.");
      }
      let key;
      try {
        key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);
      } finally {
        rawKey.fill(0);
      }
      if (code !== lastCode) {
        lastCode = code;
        lastIdempotencyKey = crypto.randomUUID();
      }
      const response = await fetch("/v1/transfers/redeem", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": lastIdempotencyKey,
        },
        cache: "no-store",
        body: JSON.stringify({ retrievalCode: code }),
      });
      if (!response.ok) throw new Error(await apiError(response));
      const transfer = await response.json();

      const nonce = fromBase64Url(transfer.envelope.nonce);
      const ciphertext = fromBase64Url(transfer.envelope.ciphertext);
      if (nonce.length !== 12) throw new Error("Šifrovaný obal má neplatný formát.");
      let plaintext;
      try {
        plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, ciphertext);
      } catch {
        throw new Error("Seznam se nepodařilo rozšifrovat. Zkontrolujte dešifrovací klíč.");
      }
      let medicationList;
      try {
        medicationList = JSON.parse(new TextDecoder().decode(plaintext));
      } catch {
        throw new Error("Rozšifrovaný obsah nemá platný formát JSON.");
      }

      renderMedicationList(content, medicationList);
      document.getElementById("result-expiry").textContent = `Přenos vyprší ${new Date(transfer.expiresAt).toLocaleString("cs-CZ")}.`;
      keyInput.value = "";
      result.hidden = false;
      setStatus(status, "Seznam byl rozšifrován v tomto prohlížeči.", "success");
    } catch (error) {
      setStatus(status, error instanceof Error ? error.message : "Přenos se nepodařilo otevřít.", "error");
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("clear-result").addEventListener("click", () => {
    content.replaceChildren();
    result.hidden = true;
    codeInput.value = "";
    keyInput.value = "";
    lastCode = "";
    lastIdempotencyKey = "";
    setStatus(status, "Zobrazení bylo zavřeno a vstupní údaje vymazány.");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setupCopyButtons();
  const view = document.body.dataset.view;
  if (view === "patient") setupPatient();
  if (view === "doctor") setupDoctor();
});
