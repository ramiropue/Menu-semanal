# Automatización Segura de Publicación de Recetas

Este documento describe el flujo y las herramientas disponibles para validar, publicar y vigilar recetas Markdown en `RecetasNOTAS/`.

---

## 1. Comandos Disponibles

### `npm run recipes:validate`
- **Función**: Verifica la integridad de todas las recetas en `RecetasNOTAS/`.
- **Acciones**:
  1. Comprueba formato Markdown, título no vacío, ingredientes estructurados y pasos.
  2. Detecta enlaces de origen (`Link:`) y etiquetas inline.
  3. Verifica que no existan IDs duplicados.
  4. Regenera atómicamente `data/markdownRecipesManifest.json`.
  5. Ejecuta la suite de pruebas unitarias de recetas (`npm test -- tests/recipes/`).
  6. Ejecuta `git diff --check` para verificar formato y espacios en blanco.
- **Garantía**: No realiza commits ni pushes.

### `npm run recipes:publish` (Dry-Run por defecto)
- **Función**: Inspecciona los cambios pendientes y muestra el plan de publicación.
- **Acciones**:
  - Verifica que la rama activa sea estrictamente `v2/phase-1-household-auth` (prohíbe publicar en `main`).
  - Realiza `git fetch` y comprueba que la rama local no esté por detrás del remoto.
  - Verifica que no haya archivos modificados ajenos a `RecetasNOTAS/` y el manifiesto.
  - Bloquea archivos peligrosos (`.DS_Store`, `.env*`, copias de seguridad).
  - Bloquea eliminaciones accidentales (requiere flag `--allow-delete`).
  - Muestra el resumen del commit y las recetas afectadas.
- **Publicación real**: Solo se ejecuta con el flag `--execute`:
  ```bash
  npm run recipes:publish -- --execute
  ```

### `npm run recipes:watch`
- **Función**: Vigilante local para cambios en tiempo real en `RecetasNOTAS/`.
- **Características**:
  - Debounce de 1200ms para no procesar archivos mientras la app de notas está escribiendo.
  - Bloqueo de concurrencia para evitar ejecuciones simultáneas.
  - Ignora archivos temporales y no `.md`.
  - Opera en modo **Dry-Run por defecto**.
  - Si se desea publicación automática continua al guardar:
    ```bash
    npm run recipes:watch -- --execute
    ```

---

## 2. Salvaguardas de Seguridad

| Salvaguarda | Comportamiento |
| :--- | :--- |
| **Rama `main`** | Prohibido terminantemente; el script aborta inmediatamente con error crítico. |
| **Rama permitida** | Exclusivamente `v2/phase-1-household-auth` durante esta fase. |
| **Force-Push** | Prohibido en todos los casos; solo pushes normales de avance. |
| **Sincronización remota** | Se comprueba divergencia/atraso antes de cualquier intento de push. |
| **Archivos no relacionados** | Si existen cambios en `app/`, `components/`, etc., el script aborta para evitar commits mixtos. |
| **Eliminaciones** | Si se borra una nota, requiere `--allow-delete` para confirmar que no fue un error accidental. |

---

## 3. Instrucciones para Activación Futura en macOS

> [!IMPORTANT]
> **No instalar de forma permanente sin aprobación previa.**
> El sistema se encuentra preparado como script manual. Para configurarlo como daemon permanente una vez aprobado:

### Opción A: Servicio launchd de Usuario
1. Ajustar la ruta del binario `node` en la plantilla:
   [`mi_menu_semanal/docs/recipes-watcher-launchd.plist.example`](file:///Users/cited/Desktop/VibeCoding/Menu%20semanal/mi_menu_semanal/docs/recipes-watcher-launchd.plist.example)
2. Copiar la plantilla a la carpeta de agentes del usuario:
   ```bash
   cp docs/recipes-watcher-launchd.plist.example ~/Library/LaunchAgents/com.menusemanal.recipeswatcher.plist
   ```
3. Cargar el servicio:
   ```bash
   launchctl load ~/Library/LaunchAgents/com.menusemanal.recipeswatcher.plist
   ```
4. Para detener o desinstalar:
   ```bash
   launchctl unload ~/Library/LaunchAgents/com.menusemanal.recipeswatcher.plist
   rm ~/Library/LaunchAgents/com.menusemanal.recipeswatcher.plist
   ```

### Opción B: Acción de Carpeta (Folder Action en macOS)
1. Abrir la utilidad **Configuración de Acciones de Carpeta** en macOS.
2. Asociar a la carpeta `RecetasNOTAS` un AppleScript simple que ejecute:
   ```applescript
   do shell script "cd '/Users/cited/Desktop/VibeCoding/Menu semanal/mi_menu_semanal' && npm run recipes:validate"
   ```
