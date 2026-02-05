# 🚀 Guía de Deployment en Hostinger

## Repositorio GitHub
**URL:** https://github.com/duvan51/Gym-admin.git

## Requisitos Previos
- Node.js 18+ instalado
- Cuenta de Hostinger activa
- Credenciales de Supabase
- API Key de Gemini AI

---

## 📋 Opción 1: Deployment via Git en Hostinger

### Paso 1: Configurar Git en Hostinger
1. Accede al panel de Hostinger
2. Ve a **Git** en el menú lateral
3. Configura el repositorio:
   - Repository URL: `https://github.com/duvan51/Gym-admin.git`
   - Branch: `main`
   - Deploy Path: `/public_html` (o tu directorio web)

### Paso 2: Configurar Build Commands
En la configuración de deployment de Hostinger, establece:

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Move files to the correct location
cp -r dist/* ./
```

### Paso 3: Variables de Entorno
En el panel de Hostinger, configura estas variables de entorno:

```
GEMINI_API_KEY=tu_clave_de_gemini_aqui
VITE_SUPABASE_URL=tu_url_de_supabase_aqui
VITE_SUPABASE_ANON_KEY=tu_clave_anonima_de_supabase_aqui
```

⚠️ **IMPORTANTE:** Las variables que empiezan con `VITE_` deben estar configuradas en el momento del build.

---

## 📦 Opción 2: Deployment Manual (FTP/File Manager)

### Paso 1: Build local
```bash
npm install
npm run build
```

### Paso 2: Subir archivos
1. Los archivos compilados estarán en la carpeta `dist/`
2. Accede al File Manager de Hostinger
3. Ve a `public_html` (o tu directorio web)
4. Sube **TODO EL CONTENIDO** de la carpeta `dist/` (no la carpeta dist, sino su contenido)

### Paso 3: Configurar .htaccess para SPA
Crea un archivo `.htaccess` en el directorio raíz con este contenido:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

---

## 🔧 Configuración del Backend (Supabase)

### Base de Datos
1. Ejecuta el archivo `supabase_schema.sql` en tu proyecto de Supabase
2. Esto creará todas las tablas necesarias

### Variables de Entorno
Asegúrate de tener:
- **VITE_SUPABASE_URL**: La URL de tu proyecto (formato: `https://xxx.supabase.co`)
- **VITE_SUPABASE_ANON_KEY**: La clave anónima/pública de tu proyecto

---

## ✅ Verificación Post-Deployment

Después del deployment, verifica:

1. ✅ La aplicación carga correctamente
2. ✅ Las rutas funcionan (React Router)
3. ✅ La conexión con Supabase funciona
4. ✅ El servicio de Gemini AI responde
5. ✅ No hay errores 404 en recursos estáticos

---

## 🔄 Actualizar el Deployment

### Via Git (Opción 1)
```bash
# En tu máquina local
git add .
git commit -m "tu mensaje de commit"
git push origin main
```
Hostinger detectará los cambios y hará el rebuild automáticamente.

### Manual (Opción 2)
```bash
npm run build
```
Luego sube nuevamente el contenido de `dist/` via FTP.

---

## 🐛 Troubleshooting

### Error: Variables de entorno no definidas
- Las variables `VITE_*` deben estar disponibles en tiempo de BUILD
- En Hostinger, configúralas ANTES de hacer el deploy

### Error 404 en rutas
- Verifica que el archivo `.htaccess` esté configurado correctamente
- Asegúrate de que mod_rewrite esté habilitado en el servidor

### Error de conexión con Supabase
- Verifica que las URLs no tengan espacios o caracteres extra
- Confirma que las credenciales sean correctas
- Verifica que la base de datos esté activa

### Problemas con Gemini AI
- Verifica que la API Key sea válida
- Confirma que no hayas excedido el límite de llamadas

---

## 📞 Soporte

Si tienes problemas:
1. Revisa los logs en Hostinger
2. Usa la consola del navegador (F12) para ver errores
3. Verifica la configuración de las variables de entorno

---

**Última actualización:** Febrero 2026
