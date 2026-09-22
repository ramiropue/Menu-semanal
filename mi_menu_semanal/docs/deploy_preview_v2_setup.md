# Guía de Preparación: Deploy Preview Privado (Etapa 5C-A)

Este documento describe la configuración de variables de entorno requerida en Netlify para habilitar la prueba privada de la V2 en **Deploy Previews**, garantizando que la versión en **Producción** (V1) permanezca completamente pública e inalterada.

---

## 1. Contrato de Feature Flags

El sistema dispone de tres variables independientes para desacoplar el servidor, la interfaz cliente y la persistencia de datos:

| Variable | Ámbito | Propósito |
| :--- | :--- | :--- |
| `AUTH_GUARD_ENABLED` | **Servidor** (Node/SSR/Middleware) | Activa la protección de rutas mediante `requireAuth` y `proxy.ts`. Si es `false`, el acceso a todas las rutas es libre (modo V1). |
| `NEXT_PUBLIC_AUTH_GUARD_ENABLED` | **Cliente** (Navegador) | Controla la visibilidad de los controles de usuario privado en la interfaz (e.g. botón "Cerrar sesión"). Si es `false`, no se muestran. |
| `NEXT_PUBLIC_SHARED_STATE_ENABLED` | **Cliente y Servidor** | Dirige las lecturas y escrituras hacia `public.shared_state` vía RPC atómico (modo V2). Si es `false`, opera en `categories` (modo V1). |

> [!IMPORTANT]
> - Cada flag requiere la cadena exacta `"true"` para activarse. Cualquier otro valor (`"false"`, `"1"`, `"yes"`, o valor ausente) evalúa de forma segura a `false`.
> - No existe activación cruzada ni implícita entre variables.

---

## 2. Configuración de Variables en Netlify

En el panel de Netlify (*Site configuration > Environment variables*):

### A. Contexto: Producción (*Production*)

Garantiza la operatividad 100% pública e idéntica de la versión V1 desplegada actualmente:

```text
AUTH_GUARD_ENABLED=false
NEXT_PUBLIC_AUTH_GUARD_ENABLED=false
NEXT_PUBLIC_SHARED_STATE_ENABLED=false
```

### B. Contexto: Vistas Previas de Despliegue (*Deploy Previews*)

Habilita el flujo privado completo para las dos cuentas autorizadas en las ramas de preview (ej. `v2/phase-1-household-auth`):

```text
AUTH_GUARD_ENABLED=true
NEXT_PUBLIC_AUTH_GUARD_ENABLED=true
NEXT_PUBLIC_SHARED_STATE_ENABLED=true
```

> [!NOTE]
> Las variables preexistentes de conexión (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GEMINI_API_KEY`, etc.) ya configuradas en Netlify se mantienen compartidas para todos los contextos (*All scopes / All deploy contexts*) sin modificarse.

---

## 3. Lista de Acciones Manuales Futuras en Netlify (Solo Consulta — No Ejecutar Todavía)

Cuando se autorice la creación del preview, el procedimiento manual en el panel de Netlify consistirá en:

1. **Acceder a la configuración de variables del sitio**:
   - Ir a *Netlify Dashboard > Menú Semanal > Site configuration > Environment variables*.
2. **Definir o editar las tres variables con ámbitos diferenciados**:
   - Para `AUTH_GUARD_ENABLED`:
     - *Production*: `false`
     - *Deploy Previews*: `true`
   - Para `NEXT_PUBLIC_AUTH_GUARD_ENABLED`:
     - *Production*: `false`
     - *Deploy Previews*: `true`
   - Para `NEXT_PUBLIC_SHARED_STATE_ENABLED`:
     - *Production*: `false`
     - *Deploy Previews*: `true`
3. **Guardar cambios**:
   - Confirmar las variables seleccionando el botón *Save*.
4. **Despliegue del Preview**:
   - Abrir un Pull Request de la rama `v2/phase-1-household-auth` hacia la rama principal para que Netlify genere automáticamente el Deploy Preview aislado con la URL temporal asignada.
