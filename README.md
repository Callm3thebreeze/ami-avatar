# Avatar de Laude

Componente SVG con la animación aprobada. `index.html` sigue siendo el laboratorio original; `example.html` muestra una integración mínima. No incluye chat, micrófono ni llamadas al asistente.

## Integración sin compilación

Copia `avatar/` y `vendor/` a tu web. No hacen falta los SVG sueltos, el panel de pruebas ni OpenDesign en producción: la geometría está incluida en el componente.

```html
<link rel="stylesheet" href="/robot/avatar/robot-avatar.css">
<div id="asistente-avatar" style="width: 180px"></div>
<script src="/robot/vendor/gsap.min.js"></script>
<script src="/robot/avatar/robot-avatar.js"></script>
<script>
  const avatar = new RobotAvatar(document.querySelector('#asistente-avatar'), {
    speechSimulation: false
  });
  avatar.setState('escucha');
  // Al desmontar la vista: avatar.destroy();
</script>
```

Las rutas son ejemplos: ajústalas al lugar donde publiques los archivos. Carga los dos scripts una sola vez, con GSAP primero. El componente no hace peticiones de red ni necesita un servicio externo. Respeta el aviso de licencia incluido en GSAP.

## Uso con un empaquetador

Este directorio también se puede instalar como paquete local privado:

```sh
npm install /ruta/al/robot-avatar
```

```js
import RobotAvatar from '@laude/robot-avatar';
import '@laude/robot-avatar/avatar/robot-avatar.css';

const avatar = new RobotAvatar(contenedor, { speechSimulation: false });
```

El punto de entrada es CommonJS/UMD; el import anterior necesita un empaquetador con interoperabilidad CommonJS. Para HTML nativo usa los scripts del primer ejemplo. GSAP está incluido localmente, sin instalación adicional. Se incluyen declaraciones TypeScript.

En React, monta la instancia en un `useEffect` con un contenedor obtenido por `useRef`, y devuelve `() => avatar.destroy()`. En Vue utiliza montaje y desmontaje equivalentes. En SSR importa/instancia el avatar únicamente en el cliente. No recrees la instancia en cada render.

## API

| Método | Uso |
| --- | --- |
| `setState(nombre, { instant: false })` | `reposo`, `escucha`, `pensamiento`, `habla`, `alegria`, `duda`, `sorpresa`. Devuelve false si el estado no es válido. |
| `setMouthOpen(apertura, segundos)` | Apertura de 0 a 1. Se suaviza; duración por defecto 0.12 s. |
| `setIntensity(valor)` | Intensidad de 0 a 1.5. |
| `setReducedMotion(true)` | Detiene los bucles decorativos. Al crear la instancia se consulta la preferencia del sistema; para cambios posteriores utiliza este método. |
| `setSpeechSimulation(false)` | Desactiva de forma persistente la boca simulada, también al cambiar de estado o intensidad. |
| `stopSpeechSim()` | Detiene solo la simulación actual; para audio real prefiere la opción persistente anterior. |
| `reset()` | Reposo, intensidad 1, boca neutra y preferencia de movimiento del sistema. Conserva la configuración de simulación. |
| `destroy()` | Cancela animaciones y temporizadores del avatar y retira su DOM. Se puede llamar varias veces. No destruye otras instancias. |

Opciones del constructor: `intensity`, `reducedMotion`, `speechSimulation`, `onChange(info)`. La simulación está activada por defecto para conservar el comportamiento de la demo; desactívala en producción si vas a conectar audio real.

`onChange` informa de estado, etiqueta, descripción, simulación, movimiento reducido, intensidad y apertura. No es un evento por fotograma ni una notificación de fin de transición. Para consultar valores inmediatos usa las propiedades de la instancia. `speaking` indica simulación de boca, no reproducción real de audio.

## Conexión al asistente

```js
// Se inicia captura de voz:
avatar.setState('escucha');
// Se envía la consulta:
avatar.setState('pensamiento');
// Empieza a sonar la respuesta:
avatar.setState('habla');
// La aplicación mide la envolvente del audio reproducido, valor de 0 a 1:
avatar.setMouthOpen(nivelDeAudio, 0.05);
// Termina o se interrumpe el audio:
avatar.setMouthOpen(0, 0);
avatar.setState('reposo');
```

El análisis y la reproducción de audio pertenecen a vuestra aplicación. Debéis cancelar también vuestro bucle de análisis al desmontar la vista. El valor 0 corresponde al dibujo mínimo de boca aprobado, no garantiza un cierre anatómico completo.

Se admiten varias instancias: selectores y máscaras están aislados por avatar. Mantén el CSS del personaje y no sobrescribas sus grupos internos con estilos globales de SVG. El fondo exterior es transparente y el blanco de la cara se conserva.

## Comprobaciones

`npm test` requiere Playwright y Microsoft Edge. Puede usarse el runtime de pruebas de Codex definiendo `ROBOT_PLAYWRIGHT_PATH` con la ruta absoluta al paquete Playwright. Se comprueban estados, dos instancias, boca controlada externamente, interrupciones y liberación de recursos. La prueba abre archivos locales y no usa red.
