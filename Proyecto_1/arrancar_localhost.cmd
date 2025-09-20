@echo off
setlocal ENABLEDELAYEDEXPANSION

REM === Config ===
set PORT=5500
set OPEN_URL=http://localhost:%PORT%

echo =======================================================
echo  Servidor local para tu proyecto (puerto %PORT%)
echo  - Buscará http-server (Node) o Python, lo que tengas
echo =======================================================
echo.

REM --- Ir a la carpeta del script (asegura que estés donde está index.html)
cd /d "%~dp0"

REM --- Verifica si existe index.html
if not exist "index.html" (
  echo [ADVERTENCIA] No se encontró index.html en: %cd%
  echo Asegurate de colocar este .cmd en la carpeta del proyecto.
  echo.
)

REM --- Funciones auxiliares
where >nul 2>nul node
set HAS_NODE=%ERRORLEVEL%
where >nul 2>nul npm
set HAS_NPM=%ERRORLEVEL%
where >nul 2>nul http-server
set HAS_HTTPSERVER=%ERRORLEVEL%
where >nul 2>nul python
set HAS_PYTHON=%ERRORLEVEL%

REM --- Intento 1: Node + http-server
if %HAS_NODE%==0 (
  if %HAS_HTTPSERVER%==0 (
    echo [OK] Se encontro http-server. Iniciando en puerto %PORT%...
    start "" "%OPEN_URL%"
    http-server -p %PORT% -c-1
    goto :END
  ) else (
    if %HAS_NPM%==0 (
      echo [INFO] No se encontro http-server. Instalando globalmente...
      npm i -g http-server
      where >nul 2>nul http-server
      if %ERRORLEVEL%==0 (
        echo [OK] http-server instalado. Iniciando en puerto %PORT%...
        start "" "%OPEN_URL%"
        http-server -p %PORT% -c-1
        goto :END
      ) else (
        echo [ERROR] No se pudo instalar http-server con npm.
      )
    ) else (
      echo [INFO] Tienes Node pero no npm en PATH. Intentare Python si existe...
    )
  )
) else (
  echo [INFO] No se detecto Node. Intentare con Python...
)

REM --- Intento 2: Python
if %HAS_PYTHON%==0 (
  echo [OK] Python detectado. Iniciando servidor en puerto %PORT%...
  start "" "%OPEN_URL%"
  python -m http.server %PORT%
  goto :END
) else (
  echo [ERROR] No se encontro ni Node (http-server) ni Python.
  echo.
  echo Opciones:
  echo   1) Instalar Node: https://nodejs.org  y luego ejecutar:
  echo        npm i -g http-server
  echo        http-server -p %PORT%
  echo   2) O instalar Python: https://www.python.org  y luego:
  echo        python -m http.server %PORT%
  echo.
  pause
  goto :END
)

:END
echo.
echo [TIP] Para detener el servidor, vuelve a esta ventana y presiona Ctrl+C.
endlocal
