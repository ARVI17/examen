# Guia de operacion LAN

## 1. Servidor LAN
- Este PC es el servidor local.
- URL Admin: `http://192.168.1.25:4000/admin/`
- URL Simulador: `http://192.168.1.25:4000/simulador/`

## 2. Verificaciones rapidas
- `docker compose ps`
- `curl -f http://192.168.1.25:4000/health`
- `curl -f http://192.168.1.25:4000/health/ready`

## 3. Red
- Mantener perfil de red en Privado.
- Permitir puerto TCP 4000 en firewall local.
- Recomendar servidor por cable Ethernet.

## 4. Conexion de otros equipos
1. Confirmar misma red LAN/WiFi.
2. Abrir URL del simulador por IP.
3. Si falla, validar IP actual y firewall.

## 5. Durante simulacro
- No ejecutar importaciones, backups, resets ni IA pesada.
- Monitorear panel Operacion del sistema.
- Revisar logs API solo en caso de incidente.

## 6. Comandos de referencia
- `docker compose ps`
- `docker compose logs api --tail=100`
- `docker compose run --rm api npm run test:lan-load`
