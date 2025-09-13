# Usar una imagen oficial de Node.js
FROM node:18-alpine

# Establecer el directorio de trabajo
WORKDIR /app

# Copiar los archivos de dependencias del backend
COPY backend/package.json backend/package-lock.json* ./backend/

# Instalar las dependencias del backend
RUN npm install --prefix backend

# Copiar el resto de los archivos del proyecto
COPY . .

# Railway usa la variable de entorno PORT automáticamente
# por lo que no es necesario EXPOSE, pero es una buena práctica
EXPOSE 8080

# Comando para iniciar el servidor
CMD ["node", "backend/index.js"]
