/* ============================================================================
   robot-avatar.js — componente de avatar reutilizable.

   El personaje y su rig viven aquí. No conoce el panel de demostración ni
   ningún control: se instancia sobre un contenedor y se gobierna por su API
   pública, de modo que pueda montarse después en un widget de escritorio.

   Dependencia: GSAP 3 (core). Se carga antes de este archivo.

       const bot = new RobotAvatar(document.querySelector('#slot'));
       bot.setState('habla');
       bot.setMouthOpen(0.6);   // <- punto de enganche para audio real

   ----------------------------------------------------------------------------
   FIDELIDAD
   Todos los trazados, elipses, rectángulos blancos, máscaras, colores,
   transformaciones y grosores de contorno provienen literalmente de los cinco
   SVG entregados (main, happy, doubt, surprised, thinking). No se ha
   redibujado nada ni se ha añadido cuerpo, ruedas, pupilas, sombras ni
   decoración.

   Dos desviaciones deliberadas, ambas anotadas en su sitio:
   1. El viewBox se amplía con 70px de margen por lado (-70 -70 1043 1498) para
      que la inclinación de cabeza y el balanceo de antena no recorten el
      bulbo ni los destellos. El personaje conserva su escala y proporciones
      exactas dentro de ese lienzo: solo se le da aire alrededor.
   2. main.svg dibuja dos veces la pila completa de cabeza, ojos y antena; la
      segunda capa tapa íntegramente la primera, así que la primera es
      geometría muerta y se omite. El resultado visible es idéntico.
      El contorno de cabeza de thinking.svg (62) se normaliza a 54, el valor
      de los otros cuatro archivos, con main.svg como base declarada.

   ----------------------------------------------------------------------------
   ANTIACUMULACIÓN
   El rig está anidado de modo que cada grupo tiene UN ÚNICO escritor de
   propiedad. Ninguna animación compite con otra, así que cambiar de estado a
   mitad de una transición no puede sumar transformaciones ni saltar:

     rb-root     respiración            y, scale        (bucle permanente)
     rb-sway     balanceo ambiental     rotation        (bucle por estado)
     rb-nod      cabeceo de habla       y               (bucle solo en habla)
     rb-headrig  inclinación de estado  rotation        (destino absoluto)
     rb-face     desplazamiento facial  x, y            (destino absoluto)
     rb-eyes     atención               scale           (destino absoluto)
     ojo izq/der parpadeo               scaleY          (bucle de parpadeo)
     boca activa apertura               scaleY, scaleX  (setMouthOpen)
     antena-lag  retardo tras la cabeza rotation        (reacción al tilt)
     antena-idle vibración de antena    rotation        (bucle por estado)
   ========================================================================= */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../vendor/gsap.min.js').gsap);
  else root.RobotAvatar = factory(root.gsap);
})(typeof self !== 'undefined' ? self : this, function (gsap) {
  'use strict';

  /* ---------------------------------------------------------------------- */
  /* Geometría original, extraída de los cinco SVG                          */
  /* ---------------------------------------------------------------------- */

  // Silueta de la cabeza: compartida, idéntica en los cinco archivos.
  var HEAD_D =
    'M860.53 1001.39C837.191 1198.29 635.095 1336.19 409.136 1309.4C183.176 1282.62 18.9196 1101.29 42.2582 904.4C65.5969 707.508 267.693 569.608 493.652 596.393C719.612 623.177 883.868 804.502 860.53 1001.39Z';

  /* ----------------------------------------------------------------------
     Boca de habla: interpolación real de trazados.

     Los cuatro dibujos de speak1..speak4 se reducen a tres piezas, y las tres
     son interpolables punto a punto, así que la boca se deforma de verdad en
     lugar de cambiar de dibujo:

     · SHELL — la silueta. En los archivos, speak2, speak3 y speak4 ya tienen
       topología idéntica (M + 6 curvas + 2 rectas + Z, 21 puntos). speak1
       traía 4 curvas en lugar de 6, así que sus curvas 2 y 4 están
       subdivididas por De Casteljau en t=0,5: una operación exacta, el trazo
       dibujado es el mismo y pasa a tener los mismos 21 puntos.

     · El contorno grueso. En los cuatro archivos Figma exportó la expansión
       de un trazo centrado de 25 px (los desplazamientos miden 12,5 en todos).
       Aquí vuelve a ser un stroke real sobre la silueta, así que acompaña la
       deformación sin tener que interpolar la expansión.

     · LIP — la línea de labio. En los cuatro es una línea de dos puntos con
       trazo de 15 px, extraída de su centro.

     Orden de la escalera, por apertura creciente: speak4, speak3, speak2,
     speak1. Reordenar estas dos tablas y los grupos de lengua del marcado
     reordena la secuencia.
     -------------------------------------------------------------------- */

  // 21 puntos por fotograma: M(1) + 6×C(3) + L(1) + L(1).
  var SHELL_SEGS = [['M', 1], ['C', 3], ['C', 3], ['C', 3], ['C', 3], ['C', 3], ['C', 3], ['L', 1], ['L', 1]];

  var SHELL = [
    // 0 — speak4
    [354.392, 1039.37, 309.327, 1043.84, 273.469, 1089.82, 307.542, 1119.71,
     308.822, 1120.83, 310.138, 1121.92, 311.49, 1122.97, 334.752, 1141.08,
     366.822, 1147.01, 396.834, 1144.03, 426.846, 1141.05, 454.282, 1133.45,
     473.464, 1111.12, 475.064, 1109.26, 476.535, 1107.32, 477.886, 1105.3,
     503.043, 1067.76, 454.018, 1029.61, 409.008, 1033.99, 385.955, 1036.23,
     354.392, 1039.37],
    // 1 — speak3
    [354.402, 1039.44, 309.332, 1043.87, 273.829, 1086.12, 296.455, 1125.41,
     301.559, 1134.27, 307.468, 1142.36, 314.195, 1149.36, 338.154, 1174.27,
     370.537, 1183.26, 400.552, 1180.31, 430.567, 1177.36, 457.84, 1168.17,
     476.329, 1139.08, 482.107, 1129.99, 486.033, 1119.3, 488.584, 1107.74,
     498.311, 1063.64, 454.078, 1029.82, 409.082, 1034.12, 385.969, 1036.33,
     354.402, 1039.44],
    // 2 — speak2
    [328.52, 1042.19, 283.449, 1046.61, 248.078, 1089.43, 273.562, 1126.94,
     279.75, 1136.05, 287.007, 1144.32, 295.362, 1151.41, 324.18, 1175.85,
     363.697, 1184.15, 400.583, 1180.53, 437.469, 1176.91, 471.134, 1167.1,
     494.479, 1137.54, 501.861, 1128.19, 506.956, 1117.25, 510.35, 1105.44,
     522.829, 1062.03, 477.993, 1027.73, 432.983, 1032.05, 385.99, 1036.55,
     328.52, 1042.19],
    // 3 — speak1, con las curvas 2 y 4 subdivididas en t=0,5
    [247.433, 1049.12, 251.089, 1088.58, 263.592, 1128.87, 285.515, 1155.05,
     296.477, 1168.145, 309.345, 1177.178, 322.891, 1182.634, 336.437, 1188.09,
     350.661, 1189.97, 364.335, 1188.76, 391.684, 1186.34, 416.511, 1177.43,
     433.265, 1147.81, 441.642, 1133.005, 447.657, 1113.633, 451.121, 1093.029,
     454.585, 1072.425, 455.498, 1050.59, 453.67, 1030.86, 350.551, 1039.99,
     247.433, 1049.12]
  ];

  // Centro de la línea de labio de cada fotograma: dos puntos.
  var LIP = [
    [319.221, 1122.5, 478.199, 1099.04],   // speak4
    [296.002, 1105.16, 474.927, 1076.04],  // speak3
    [274.998, 1129.04, 496.913, 1109.04],  // speak2
    [262.99, 1116.71, 450.134, 1098.74]    // speak1
  ];

  function mix(a, b, t, i) { return (a[i] + (b[i] - a[i]) * t).toFixed(2); }

  function buildShell(a, b, t) {
    var out = '', k = 0;
    for (var s = 0; s < SHELL_SEGS.length; s++) {
      out += SHELL_SEGS[s][0];
      for (var n = 0; n < SHELL_SEGS[s][1]; n++, k += 2) {
        out += (n ? ' ' : '') + mix(a, b, t, k) + ' ' + mix(a, b, t, k + 1);
      }
    }
    return out + 'Z';
  }

  function buildLip(a, b, t) {
    return 'M' + mix(a, b, t, 0) + ' ' + mix(a, b, t, 1) +
           'L' + mix(a, b, t, 2) + ' ' + mix(a, b, t, 3);
  }

  /* ----------------------------------------------------------------------
     Relleno liso de la parte inferior de la boca.

     Sustituye a las elipses de los archivos, que eran un apaño para rellenar
     esa zona: no hay forma de interpolar 2 elipses con 8, y al cruzarlas
     dejaban huecos blancos. Aquí la zona se rellena por geometría.

     El relleno es un cuadrilátero cuyo borde superior ES la línea de labio
     —así hereda su inclinación en cada fotograma— y que baja mucho más allá
     del fondo de la boca. Recortado contra la silueta, lo que queda es
     exactamente el interior inferior, en color liso. Como la silueta y la
     línea de labio se interpolan, el relleno se deforma con ellas: no hay
     relevo, ni cruce, ni hueco posible en ningún punto del recorrido.
     -------------------------------------------------------------------- */

  // Desplazamiento del borde superior del relleno respecto a la línea de
  // labio, en px hacia abajo. 0 = el relleno empieza en la propia línea.
  // Súbelo si quieres recuperar una banda blanca entre labio y relleno.
  var LOWER_OFFSET = 0;
  var LOWER_SPAN = 120;   // prolongación lateral, para cubrir todo el ancho
  var LOWER_DEPTH = 400;  // profundidad, para rebasar siempre el fondo

  function buildLower(a, b, t) {
    var x1 = +mix(a, b, t, 0), y1 = +mix(a, b, t, 1);
    var x2 = +mix(a, b, t, 2), y2 = +mix(a, b, t, 3);

    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= len; dy /= len;
    var nx = -dy, ny = dx;            // normal de la línea, hacia abajo

    var ax = x1 - dx * LOWER_SPAN + nx * LOWER_OFFSET;
    var ay = y1 - dy * LOWER_SPAN + ny * LOWER_OFFSET;
    var bx = x2 + dx * LOWER_SPAN + nx * LOWER_OFFSET;
    var by = y2 + dy * LOWER_SPAN + ny * LOWER_OFFSET;

    return 'M' + ax.toFixed(2) + ' ' + ay.toFixed(2) +
           'L' + bx.toFixed(2) + ' ' + by.toFixed(2) +
           'L' + (bx + nx * LOWER_DEPTH).toFixed(2) + ' ' + (by + ny * LOWER_DEPTH).toFixed(2) +
           'L' + (ax + nx * LOWER_DEPTH).toFixed(2) + ' ' + (ay + ny * LOWER_DEPTH).toFixed(2) +
           'Z';
  }

  // Boca de sorpresa: anillo. Silueta usada por el relleno y por la máscara.
  var MOUTH_O_D =
    'M410.355 1138.29C405.456 1168.09 375.185 1187.72 342.742 1182.12C310.3 1176.52 287.972 1147.82 292.871 1118.01C297.77 1088.2 328.041 1068.58 360.484 1074.17C392.926 1079.77 415.254 1108.48 410.355 1138.29Z';

  function svgMarkup(uid) {
    var headMask = 'rbHead-' + uid;
    var oMask = 'rbMouthO-' + uid;
    var lowerClip = 'rbMouthLower-' + uid;
    var shell0 = buildShell(SHELL[0], SHELL[0], 0);

    return (
      // fill="none" en la raíz, igual que los cinco archivos originales. Es
      // obligatorio: los trazados que solo llevan stroke (el rectángulo de la
      // boca de duda, el tallo y los destellos de la antena) no declaran
      // relleno, y sin esto SVG les aplica su negro por defecto.
      '<svg class="robot-avatar__svg" viewBox="-70 -70 1043 1498" fill="none" ' +
      'xmlns="http://www.w3.org/2000/svg" role="img" ' +
      'aria-label="Avatar robot del asistente">' +
      '<defs>' +
      '<mask id="' + headMask + '" fill="white"><path d="' + HEAD_D + '"/></mask>' +
      '<mask id="' + oMask + '" fill="white"><path d="' + MOUTH_O_D + '"/></mask>' +
      /* Recorte del relleno inferior: es la propia silueta de la boca, y se
         recalcula con ella en cada fotograma. */
      '<clipPath id="' + lowerClip + '">' +
      '<path data-part="mouth-clip" d="' + shell0 + '"/>' +
      '</clipPath>' +
      '</defs>' +

      '<g data-part="root">' +
      '<g data-part="sway">' +
      '<g data-part="nod">' +
      '<g data-part="head-rig">' +

      /* --- Nuez de la antena. Va DETRÁS de la cabeza, igual que en los SVG:
             solo asoma su parte superior y el resto queda oculto por la
             cabeza. Si se dibujase delante, pintaría violeta sobre el
             interior blanco. ------------------------------------------- */
      '<g data-part="antenna-lag-back">' +
      '<g data-part="antenna-idle-back">' +
      '<ellipse data-part="antenna-nub" cx="513.76" cy="617.909" rx="138.5" ry="84" transform="rotate(6.76004 513.76 617.909)" fill="#4A1FCC"/>' +
      '</g></g>' +

      /* --- Cabeza: relleno blanco + contorno de 54 enmascarado a la propia
             silueta, que es el mecanismo original (el trazo se dibuja solo
             hacia dentro). ------------------------------------------------ */
      '<g data-part="head">' +
      '<path d="' + HEAD_D + '" fill="white"/>' +
      '<path d="' + HEAD_D + '" fill="none" stroke="#4A1FCC" stroke-width="54" mask="url(#' + headMask + ')"/>' +
      '</g>' +

      '<g data-part="face">' +

      /* ================= OJOS ================= */
      '<g data-part="eyes">' +

      /* Familia A — almendra. main.svg y doubt.svg.
         Sirve a reposo, escucha, habla y duda. */
      '<g data-part="eyeset" data-expr="base">' +
      '<g data-part="eye-left" data-pivot="201 857">' +
      '<path d="M194.217 771.823C202.316 768.171 210.405 766.776 218.57 768.298C250.43 774.237 268.505 819.864 259.149 870.055C256.824 882.525 252.907 894.698 247.629 905.327L205.812 897.532L209.124 879.762L232.621 884.142L239.362 847.98L215.865 843.6L222.839 806.19L199.939 801.922L192.966 839.331L182.014 837.289L194.217 771.823Z" fill="#FFA114"/>' +
      '<path d="M163.864 796.487C148.153 840.977 158.148 870.259 186.225 875.493L182.855 893.575C177.915 920.073 198.075 941.25 222.204 936.716C210.379 947.092 196.896 951.998 183.952 949.585C151.893 943.609 133.561 898.257 142.859 848.377C146.636 828.114 154.047 810.463 163.864 796.487Z" fill="#FFA114"/>' +
      '<ellipse cx="59.6106" cy="93.3164" rx="59.6106" ry="93.3164" transform="matrix(0.980501 0.196516 -0.188669 0.982041 160.054 754.229)" fill="#FFA114"/>' +
      '</g>' +
      '<g data-part="eye-right" data-pivot="375 870">' +
      '<path d="M365.919 784.466C373.916 780.597 381.965 778.985 390.167 780.287C422.176 785.366 441.472 830.49 433.47 880.915C431.482 893.443 427.894 905.717 422.903 916.484L380.892 909.817L383.725 891.965L407.331 895.711L413.097 859.38L389.49 855.634L395.455 818.05L372.448 814.399L366.484 851.983L355.481 850.237L365.919 784.466Z" fill="#FFA114"/>' +
      '<path d="M336.239 809.938C321.731 854.834 332.511 883.837 360.718 888.314L357.836 906.479C353.611 933.101 374.333 953.728 398.331 948.546C386.79 959.237 373.444 964.503 360.44 962.44C328.231 957.328 308.685 912.486 316.638 862.374C319.868 842.017 326.802 824.173 336.239 809.938Z" fill="#FFA114"/>' +
      '<ellipse cx="59.6106" cy="93.3164" rx="59.6106" ry="93.3164" transform="matrix(0.985434 0.170061 -0.162175 0.986762 331.294 767.797)" fill="#FFA114"/>' +
      /* Recubrimiento blanco de doubt.svg: recorta el borde superior del ojo
         derecho y produce el párpado caído de la duda. Vive DENTRO del grupo
         del ojo para que el recorte se mantenga durante el parpadeo. */
      '<g data-part="lid-doubt" class="rb-off">' +
      '<rect x="323.406" y="747.037" width="254" height="100" transform="rotate(6.54967 323.406 747.037)" fill="white"/>' +
      '</g>' +
      '</g>' +
      '</g>' +

      /* Familia B — círculo grande. happy.svg y surprised.svg.
         Sirve a alegría (con recubrimientos) y sorpresa (sin ellos). */
      '<g data-part="eyeset" data-expr="wide" class="rb-off">' +
      '<g data-part="eye-left" data-pivot="313 868">' +
      '<path d="M286.716 752.485C303.044 748.74 319.676 748.022 336.88 751.229C404.014 763.744 448.127 827.549 435.821 893.565C432.764 909.967 426.35 925.743 416.885 939.253L328.771 922.828L333.128 899.455L382.639 908.685L391.506 861.12L341.995 851.891L351.167 802.686L302.914 793.691L293.742 842.896L270.665 838.594L286.716 752.485Z" fill="#FFA114"/>' +
      '<path d="M227.083 781.253C200.742 838.713 225.714 879.432 284.876 890.461L280.443 914.243C273.946 949.097 318.91 980.39 368.464 977.747C345.342 989.984 317.989 994.644 290.716 989.56C223.163 976.968 178.553 913.494 190.783 847.888C195.751 821.235 208.652 798.607 227.083 781.253Z" fill="#FFA114"/>' +
      '<ellipse cx="125.6" cy="122.743" rx="125.6" ry="122.743" transform="matrix(0.981486 0.191536 -0.191926 0.981409 213.129 724.002)" fill="#FFA114"/>' +
      '<g data-part="lid-happy" class="rb-off">' +
      '<rect x="179.814" y="913.037" width="281.056" height="100" transform="rotate(3.90789 179.814 913.037)" fill="white"/>' +
      '</g>' +
      '</g>' +
      '<g data-part="eye-right" data-pivot="595 874">' +
      '<path d="M569.281 758.304C585.609 754.559 602.241 753.841 619.444 757.047C686.578 769.562 730.692 833.367 718.386 899.384C715.328 915.785 708.914 931.561 699.449 945.071L611.336 928.646L615.692 905.274L665.204 914.503L674.07 866.938L624.559 857.709L633.731 808.504L585.479 799.509L576.306 848.714L553.229 844.412L569.281 758.304Z" fill="#FFA114"/>' +
      '<path d="M509.648 787.071C483.306 844.531 508.279 885.251 567.44 896.279L563.007 920.061C556.51 954.915 601.474 986.208 651.028 983.566C627.907 995.803 600.554 1000.46 573.281 995.379C505.727 982.786 461.117 919.313 473.347 853.706C478.315 827.053 491.217 804.425 509.648 787.071Z" fill="#FFA114"/>' +
      '<ellipse cx="125.6" cy="122.743" rx="125.6" ry="122.743" transform="matrix(0.981486 0.191536 -0.191926 0.981409 495.693 729.821)" fill="#FFA114"/>' +
      '<g data-part="lid-happy" class="rb-off">' +
      '<rect x="451.109" y="928.081" width="290.155" height="100" transform="rotate(-2.34255 451.109 928.081)" fill="white"/>' +
      '</g>' +
      '</g>' +
      '</g>' +

      /* Familia C — espiral. thinking.svg. Sin elipse de relleno: son solo
         los dos trazos en espiral, tal cual los dibuja el archivo.
         Esta forma es la marca de la empresa, así que en pensamiento no
         parpadea: gira sin parar. El giro vive en un grupo interior propio
         (eye-spin) para que la escala del parpadeo y la transición sigan
         operando sobre el grupo exterior sin competir con la rotación. */
      '<g data-part="eyeset" data-expr="think" class="rb-off">' +
      '<g data-part="eye-left" data-pivot="248.6 832.9">' +
      '<g data-part="eye-spin" data-pivot="248.6 832.9">' +
      '<path d="M301.28 730.678C315.705 737.598 328.491 746.979 339.284 759.656C381.404 809.13 374.856 883.504 325.073 925.886C312.705 936.416 298.231 944.473 282.887 949.002L227.605 884.068L245.23 869.063L276.293 905.55L312.162 875.013L281.098 838.526L318.204 806.936L287.93 771.377L250.825 802.967L236.346 785.96L301.28 730.678Z" fill="#FFA114"/>' +
      '<path d="M239.309 716.772C184.378 744.338 177.839 789.905 214.956 833.503L197.022 848.772C170.739 871.148 184.842 921.541 223.247 949.111C198.552 944.535 175.382 931.728 158.271 911.629C115.888 861.847 121.863 787.427 171.337 745.307C191.435 728.196 214.944 718.849 239.309 716.772Z" fill="#FFA114"/>' +
      '</g>' +
      '</g>' +
      '<g data-part="eye-right" data-pivot="520.4 865.2">' +
      '<g data-part="eye-spin" data-pivot="520.4 865.2">' +
      '<path d="M573.068 762.896C587.492 769.816 600.278 779.196 611.071 791.874C653.191 841.348 646.643 915.721 596.86 958.104C584.492 968.634 570.018 976.69 554.674 981.22L499.392 916.286L517.017 901.281L548.08 937.767L583.949 907.231L552.886 870.744L589.991 839.154L559.717 803.595L522.612 835.185L508.133 818.178L573.068 762.896Z" fill="#FFA114"/>' +
      '<path d="M511.096 748.99C456.165 776.556 449.626 822.123 486.744 865.721L468.809 880.99C442.527 903.366 456.629 953.759 495.034 981.328C470.339 976.753 447.169 963.946 430.058 943.847C387.675 894.064 393.65 819.645 443.124 777.525C463.222 760.414 486.731 751.067 511.096 748.99Z" fill="#FFA114"/>' +
      '</g>' +
      '</g>' +
      '</g>' +

      '</g>' /* /eyes */ +

      /* ================= BOCAS ================= */
      '<g data-part="mouths">' +

      /* main.svg — sonrisa abierta con labio superior. */
      '<g data-part="mouth" data-mouth="main" data-pivot="350 1032" data-range="0.5">' +
      '<path d="M247.432 1049.12C251.088 1088.58 263.591 1128.87 285.514 1155.05C307.438 1181.24 336.985 1191.18 364.334 1188.76C391.683 1186.34 416.51 1177.43 433.264 1147.81C450.017 1118.2 457.324 1070.32 453.669 1030.86L350.55 1039.99L247.432 1049.12Z" fill="white"/>' +
      '<path d="M247.432 1049.12L246.279 1036.67L233.828 1037.78L234.981 1050.22L247.432 1049.12ZM453.669 1030.86L466.12 1029.76L464.967 1017.31L452.515 1018.41L453.669 1030.86ZM350.55 1039.99L349.397 1027.54V1027.54L350.55 1039.99ZM247.432 1049.12L234.981 1050.22C238.761 1091.03 251.75 1134.16 275.937 1163.05L285.514 1155.05L295.092 1147.06C275.432 1123.57 263.414 1086.13 259.883 1048.02L247.432 1049.12ZM285.514 1155.05L275.937 1163.05C300.621 1192.53 334.25 1203.97 365.487 1201.21L364.334 1188.76L363.181 1176.31C339.72 1178.39 314.255 1169.95 295.092 1147.06L285.514 1155.05ZM364.334 1188.76L365.487 1201.21C395.252 1198.57 424.684 1188.41 444.155 1154L433.264 1147.81L422.373 1141.63C408.337 1166.44 388.114 1174.11 363.181 1176.31L364.334 1188.76ZM433.264 1147.81L444.155 1154C462.512 1121.55 469.934 1070.92 466.12 1029.76L453.669 1030.86L441.217 1031.96C444.715 1069.71 437.523 1114.85 422.373 1141.63L433.264 1147.81ZM453.669 1030.86L452.515 1018.41L349.397 1027.54L350.55 1039.99L351.703 1052.44L454.822 1043.31L453.669 1030.86ZM350.55 1039.99L349.397 1027.54L246.279 1036.67L247.432 1049.12L248.585 1061.57L351.703 1052.44L350.55 1039.99Z" fill="#4A1FCC"/>' +
      '<path d="M262.99 1116.71L263.721 1124.17L450.865 1106.21L450.134 1098.74L449.403 1091.28L262.26 1109.24L262.99 1116.71Z" fill="#4A1FCC"/>' +
      '</g>' +

      /* ===== Boca de habla: speak1..speak4, interpolados =====
         No hay cuatro dibujos superpuestos: hay una boca que se deforma. Cada
         pieza es un único trazado cuyo atributo d se recalcula en cada
         fotograma de pantalla, interpolando entre los dos dibujos vecinos de
         la escalera (ver SHELL y LIP arriba).

         Escalera de apertura, medida sobre los propios archivos:
           0  speak4  alto de silueta 117  -> casi cerrada
           1  speak3  alto 153             -> media
           2  speak2  alto 156             -> abierta y ancha
           3  speak1  alto 160             -> más abierta

         Las elipses #411FCC de los archivos no están aquí: eran un apaño de
         Figma para rellenar el interior inferior, y al cruzarlas dejaban
         huecos blancos. Ese interior ahora se rellena por geometría, con el
         cuadrilátero recortado contra la silueta que construye buildLower. */
      '<g data-part="mouth" data-mouth="speak" data-pivot="375 1024" data-range="0.04" data-xrange="0.015" class="rb-off">' +

      /* Cuatro trazados que comparten la misma silueta interpolada. El orden
         importa: el relleno inferior va ENTRE el blanco y el contorno, para
         que el trazo de 25 px quede siempre entero y del mismo color en todo
         el borde, también por abajo. */
      '<path data-part="mouth-fill" d="' + shell0 + '" fill="white"/>' +
      '<path data-part="mouth-lower" d="' + buildLower(LIP[0], LIP[0], 0) + '" fill="#411FCC" clip-path="url(#' + lowerClip + ')"/>' +
      '<path data-part="mouth-stroke" d="' + shell0 + '" fill="none" stroke="#4A1FCC" stroke-width="25" stroke-linejoin="round"/>' +
      '<path data-part="mouth-lip" d="' + buildLip(LIP[0], LIP[0], 0) + '" stroke-width="15" stroke-linecap="round" stroke="#4A1FCC"/>' +

      '</g>' +

      /* happy.svg — sonrisa ancha. */
      '<g data-part="mouth" data-mouth="happy" data-pivot="448 1074" data-range="0.42" class="rb-off">' +
      '<path d="M321.606 1083.14C319.357 1113.07 327.706 1144.94 349.878 1167.72C372.051 1190.5 406.229 1202.32 439.835 1204.6C473.44 1206.89 505.085 1203.96 530.438 1184.41C555.791 1164.86 572.774 1130.29 575.022 1100.36L448.314 1091.75L321.606 1083.14Z" fill="white"/>' +
      '<path d="M321.606 1083.14L322.542 1070.68L310.071 1069.83L309.134 1082.29L321.606 1083.14ZM575.022 1100.36L587.494 1101.21L588.43 1088.75L575.959 1087.9L575.022 1100.36ZM448.314 1091.75L449.251 1079.29V1079.29L448.314 1091.75ZM321.606 1083.14L309.134 1082.29C306.68 1114.96 315.716 1150.61 340.882 1176.46L349.878 1167.72L358.874 1158.98C339.697 1139.28 332.034 1111.18 334.077 1083.99L321.606 1083.14ZM349.878 1167.72L340.882 1176.46C365.856 1202.12 403.355 1214.65 438.898 1217.07L439.835 1204.6L440.771 1192.14C409.104 1189.98 378.246 1178.88 358.874 1158.98L349.878 1167.72ZM439.835 1204.6L438.898 1217.07C473.356 1219.41 508.927 1216.72 538.035 1194.28L530.438 1184.41L522.84 1174.54C501.243 1191.19 473.523 1194.36 440.771 1192.14L439.835 1204.6ZM530.438 1184.41L538.035 1194.28C566.458 1172.36 585.001 1134.39 587.494 1101.21L575.022 1100.36L562.551 1099.52C560.546 1126.2 545.124 1157.36 522.84 1174.54L530.438 1184.41ZM575.022 1100.36L575.959 1087.9L449.251 1079.29L448.314 1091.75L447.377 1104.22L574.086 1112.83L575.022 1100.36ZM448.314 1091.75L449.251 1079.29L322.542 1070.68L321.606 1083.14L320.669 1095.61L447.377 1104.22L448.314 1091.75Z" fill="#4A1FCC"/>' +
      '<path d="M329.159 1133.98L328.66 1141.46L558.852 1156.06L559.351 1148.57L559.851 1141.09L329.659 1126.5L329.159 1133.98Z" fill="#4A1FCC"/>' +
      '</g>' +

      /* doubt.svg — rectángulo redondeado con línea plana. Sin relleno: deja
         ver el blanco de la cabeza, igual que el original. */
      /* doubt.svg — rectángulo redondeado de fondo blanco con la línea
         transversal cruzándolo. El rectángulo va primero y relleno de blanco,
         y la línea encima: al contrario, el relleno taparía la línea. */
      '<g data-part="mouth" data-mouth="doubt" data-pivot="311 1052" data-range="0.55" class="rb-off">' +
      '<path d="M236.074 1051.54L386.07 1050.41C408.16 1050.25 426.204 1068.02 426.37 1090.11L426.581 1118.11C426.748 1140.2 408.975 1158.24 386.884 1158.41L236.888 1159.54C214.797 1159.71 196.754 1141.94 196.588 1119.84L196.377 1091.85C196.21 1069.75 213.983 1051.71 236.074 1051.54Z" fill="white" stroke-width="20" stroke="#4A1FCC"/>' +
      '<path d="M199.553 1106.32L423.562 1106.63" stroke-width="15" stroke="#4A1FCC"/>' +
      '</g>' +

      /* surprised.svg — anillo. El relleno blanco y el contorno enmascarado
         son el mecanismo original. */
      '<g data-part="mouth" data-mouth="surprised" data-pivot="351 1128" data-range="0.3" class="rb-off">' +
      '<path d="' + MOUTH_O_D + '" fill="white"/>' +
      '<path d="M410.355 1138.29L387.69 1134.37C385.147 1149.85 368.272 1163.19 346.472 1159.43L342.742 1182.12L339.012 1204.82C382.098 1212.25 425.766 1186.34 433.02 1142.2L410.355 1138.29ZM342.742 1182.12L346.472 1159.43C324.673 1155.66 312.992 1137.4 315.536 1121.92L292.871 1118.01L270.206 1114.1C262.951 1158.24 295.927 1197.38 339.012 1204.82L342.742 1182.12ZM292.871 1118.01L315.536 1121.92C318.079 1106.45 334.954 1093.11 356.754 1096.87L360.484 1074.17L364.214 1051.48C321.128 1044.04 277.46 1069.96 270.206 1114.1L292.871 1118.01ZM360.484 1074.17L356.754 1096.87C378.553 1100.63 390.234 1118.9 387.69 1134.37L410.355 1138.29L433.02 1142.2C440.275 1098.06 407.299 1058.91 364.214 1051.48L360.484 1074.17Z" fill="#4A1FCC" mask="url(#' + oMask + ')"/>' +
      '</g>' +

      /* thinking.svg — trapecio redondeado con línea. */
      '<g data-part="mouth" data-mouth="think" data-pivot="430 1083" data-range="0.45" class="rb-off">' +
      '<path d="M326.439 1082.04C326.057 1115.26 334.392 1149.94 353.535 1173.66C372.677 1197.38 401.058 1208.19 428.511 1208.51C455.964 1208.82 481.571 1203.51 501.253 1180.24C520.936 1156.97 533.081 1117.64 533.463 1084.42L429.951 1083.23L326.439 1082.04Z" fill="white" stroke-width="25" stroke="#4A1FCC"/>' +
      '<path d="M347.049 1145.54L509.049 1146.54" stroke-width="15" stroke="#4A1FCC"/>' +
      '</g>' +

      '</g>' /* /mouths */ +
      '</g>' /* /face */ +

      /* --- Tallo, bulbo y destellos de la antena. Van DELANTE de la cabeza,
             igual que en los SVG. ------------------------------------------ */
      '<g data-part="antenna-lag">' +
      '<g data-part="antenna-idle">' +
      '<path data-part="antenna-stem" d="M525.737 569.676L680.593 189.26" stroke-width="40" stroke="#4A1FCC"/>' +
      '<ellipse data-part="antenna-bulb" cx="681.309" cy="194.768" rx="59.7447" ry="63.5853" transform="rotate(30.1493 681.309 194.768)" fill="#4A1FCC"/>' +
      /* Destellos. Medidos sobre los archivos, los tres son rayos de la misma
         longitud (81,25) que irradian del bulbo a 13°, -45° y -85°: un
         abanico, no tres adornos sueltos. Cada uno va en su propio grupo con
         su vector unitario en data-dir, porque el único movimiento que
         respeta ese dibujo es empujarlo a lo largo de su propio eje. */
      '<g data-part="spark" data-dir="0.97322 0.22987">' +
      '<path d="M793.781 198.275L872.852 216.952" stroke-width="22" stroke-linecap="round" stroke="#411FCC"/>' +
      '</g>' +
      '<g data-part="spark" data-dir="0.70557 -0.70863">' +
      '<path d="M768.512 122.238L825.838 64.6628" stroke-width="22" stroke-linecap="round" stroke="#411FCC"/>' +
      '</g>' +
      '<g data-part="spark" data-dir="0.09013 -0.99593">' +
      '<path d="M684.926 91.9175L692.249 11.001" stroke-width="22" stroke-linecap="round" stroke="#411FCC"/>' +
      '</g>' +
      '</g></g>' +

      '</g>' /* /head-rig */ +
      '</g></g></g>' /* /nod /sway /root */ +
      '</svg>'
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Definición de los siete estados                                        */
  /* ---------------------------------------------------------------------- */

  // eyes / lid / mouth eligen qué geometría original se muestra.
  // El resto son amplitudes de movimiento, escaladas por la intensidad.
  var STATES = {
    reposo: {
      label: 'Reposo',
      hint: 'Movimiento mínimo, parpadeos ocasionales y antena sutil.',
      eyes: 'base', lid: null, mouth: 'main',
      tilt: 0, face: [0, 0], eyeScale: 1,
      sway: 0.9, swayTime: 6.5, antIdle: 1.1, antTime: 3.4,
      blink: [3.4, 7.2], nod: 0, speak: false,
      // Señal de espera: emite muy de tarde en tarde y con poco recorrido.
      signal: { dir: 1, cycle: 4.8, reach: 7 }
    },
    escucha: {
      label: 'Escucha',
      hint: 'Ligera inclinación y expresión atenta.',
      eyes: 'base', lid: null, mouth: 'main',
      tilt: -5.2, face: [12, -7], eyeScale: 1.035,
      sway: 0.55, swayTime: 7.5, antIdle: 1.7, antTime: 2.8,
      blink: [2.4, 4.6], nod: 0, speak: false,
      // Recibe: el pulso entra hacia el bulbo, atento y seguido.
      signal: { dir: -1, cycle: 1.9, reach: 13 }
    },
    pensamiento: {
      label: 'Pensamiento',
      hint: 'Espirales de la marca girando a velocidad constante.',
      eyes: 'think', lid: null, mouth: 'think',
      tilt: 4.2, face: [-13, -9], eyeScale: 1,
      sway: 0.5, swayTime: 8.5, antIdle: 2.3, antTime: 2.1,
      // Sin parpadeo: las espirales son la marca y giran de forma continua.
      // Un parpadeo aplastaría el logo a mitad de giro.
      // spin = segundos por vuelta completa. Menos valor, más rápido.
      blink: null, nod: 0, speak: false, spin: 2.8,
      // Procesa: pulso hacia dentro, contenido, acompañando a las espirales.
      signal: { dir: -1, cycle: 2.6, reach: 9 }
    },
    habla: {
      label: 'Habla',
      hint: 'Cuatro dibujos de boca encadenados por apertura.',
      eyes: 'base', lid: null, mouth: 'speak',
      tilt: -1.2, face: [2, 0], eyeScale: 1,
      sway: 1.25, swayTime: 4.2, antIdle: 1.5, antTime: 2.6,
      blink: [3, 6], nod: 7, speak: true,
      // Emite: el ciclo más rápido, acompasado con la boca.
      signal: { dir: 1, cycle: 1.4, reach: 15 }
    },
    alegria: {
      label: 'Alegría',
      hint: 'Expresión de happy.svg: ojos grandes recortados y sonrisa ancha.',
      eyes: 'wide', lid: 'happy', mouth: 'happy',
      tilt: -2.6, face: [0, -5], eyeScale: 1,
      sway: 1.6, swayTime: 3.6, antIdle: 2.5, antTime: 1.7,
      blink: [4.2, 8], nod: 0, speak: false,
      // Ráfaga alegre: rápida y amplia hacia fuera.
      signal: { dir: 1, cycle: 1.1, reach: 18 }
    },
    duda: {
      label: 'Duda',
      hint: 'Expresión de doubt.svg: párpado caído y boca plana.',
      eyes: 'base', lid: 'doubt', mouth: 'doubt',
      tilt: 6.2, face: [-8, 4], eyeScale: 1,
      sway: 0.42, swayTime: 9, antIdle: 1, antTime: 4.2,
      blink: [4, 7], nod: 0, speak: false,
      // Dubitativo: señal casi apagada, como si no se decidiera a transmitir.
      signal: { dir: 1, cycle: 5.5, reach: 5 }
    },
    sorpresa: {
      label: 'Sorpresa',
      hint: 'Expresión de surprised.svg: ojos abiertos y boca en O.',
      eyes: 'wide', lid: null, mouth: 'surprised',
      tilt: -1, face: [4, -11], eyeScale: 1.03,
      sway: 0.75, swayTime: 5, antIdle: 2.9, antTime: 1.3,
      blink: [6, 11], nod: 0, speak: false,
      // Golpe de sorpresa: el recorrido más largo, luego vuelve a la calma.
      signal: { dir: 1, cycle: 2.2, reach: 22 }
    }
  };

  var STATE_ORDER = ['reposo', 'escucha', 'pensamiento', 'habla', 'alegria', 'duda', 'sorpresa'];

  var PIVOT_BODY = '451 1000';   // centro aproximado del personaje: escala la respiración
  var PIVOT_NECK = '451 1290';   // base de la cabeza: eje de inclinación y balanceo
  var PIVOT_ANT = '513.76 617.909'; // centro de la nuez: eje de la antena
  // Eje fijo del conjunto de ojos. Explícito a propósito: si se dejase el
  // origen por defecto, GSAP lo calcularía desde la caja del grupo, que cambia
  // al encender y apagar familias de ojos, y el cambio de expresión daría un
  // pequeño salto de posición.
  var PIVOT_EYES = '380 865';

  // Nivel de reposo de un destello mientras la señal está activa. El pulso lo
  // lleva a 1 y vuelve aquí; así hay contraste entre el rayo encendido y los
  // otros dos. Con la señal apagada los tres vuelven a opacidad 1, que es el
  // dibujo original de los archivos.
  var SIGNAL_DIM = 0.28;

  /* ---------------------------------------------------------------------- */
  /* Utilidades                                                             */
  /* ---------------------------------------------------------------------- */

  var uidSeed = 0;
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }

  /* ---------------------------------------------------------------------- */
  /* Componente                                                             */
  /* ---------------------------------------------------------------------- */

  function RobotAvatar(host, options) {
    if (!gsap) {
      throw new Error('RobotAvatar necesita GSAP 3. Carga vendor/gsap.min.js antes de este archivo.');
    }
    if (!host || host.nodeType !== 1) throw new Error('RobotAvatar necesita un elemento contenedor.');

    var opts = options || {};
    this._destroyed = false;
    this.speechSimulation = opts.speechSimulation !== false;
    this.uid = 'rb' + (++uidSeed);

    this.el = document.createElement('div');
    this.el.className = 'robot-avatar';
    this.el.innerHTML = svgMarkup(this.uid);
    host.appendChild(this.el);

    var q = this.el.querySelector.bind(this.el);
    var qa = this.el.querySelectorAll.bind(this.el);

    this.parts = {
      root: q('[data-part="root"]'),
      sway: q('[data-part="sway"]'),
      nod: q('[data-part="nod"]'),
      headRig: q('[data-part="head-rig"]'),
      face: q('[data-part="face"]'),
      eyes: q('[data-part="eyes"]'),
      eyesets: {},
      mouths: {},
      // Las dos mitades de la antena se mueven como una sola: un tween, dos
      // destinos, el mismo eje. Así la junta con la nuez nunca se separa.
      antLag: [q('[data-part="antenna-lag-back"]'), q('[data-part="antenna-lag"]')],
      antIdle: [q('[data-part="antenna-idle-back"]'), q('[data-part="antenna-idle"]')],
      // Los tres destellos, en orden de abanico (13°, -45°, -85°). Su único
      // escritor es la cadena de señal.
      sparks: qa('[data-part="spark"]'),
      // Grupos interiores de las espirales de pensamiento: su único escritor
      // es el giro continuo.
      eyeSpin: qa('[data-part="eye-spin"]'),
      // Boca de habla: cinco trazados que se recalculan juntos en cada
      // fotograma. Ninguno se cruza con otro por opacidad.
      mouthFill: q('[data-part="mouth-fill"]'),
      mouthStroke: q('[data-part="mouth-stroke"]'),
      mouthClip: q('[data-part="mouth-clip"]'),
      mouthLower: q('[data-part="mouth-lower"]'),
      mouthLip: q('[data-part="mouth-lip"]')
    };

    var i;
    var sets = qa('[data-part="eyeset"]');
    for (i = 0; i < sets.length; i++) {
      this.parts.eyesets[sets[i].getAttribute('data-expr')] = {
        group: sets[i],
        eyes: sets[i].querySelectorAll('[data-part="eye-left"],[data-part="eye-right"]'),
        lidHappy: sets[i].querySelectorAll('[data-part="lid-happy"]'),
        lidDoubt: sets[i].querySelectorAll('[data-part="lid-doubt"]')
      };
    }
    var mouths = qa('[data-part="mouth"]');
    for (i = 0; i < mouths.length; i++) {
      this.parts.mouths[mouths[i].getAttribute('data-mouth')] = mouths[i];
    }

    // Ejes de transformación, fijados una sola vez. GSAP los conserva en los
    // tweens posteriores, de modo que ninguna animación recalcula el origen y
    // no puede producir un salto de posición.
    gsap.set(this.parts.root, { svgOrigin: PIVOT_BODY });
    gsap.set(this.parts.sway, { svgOrigin: PIVOT_NECK });
    gsap.set(this.parts.headRig, { svgOrigin: PIVOT_NECK });
    gsap.set(this.parts.eyes, { svgOrigin: PIVOT_EYES });
    gsap.set(this.parts.antLag, { svgOrigin: PIVOT_ANT });
    gsap.set(this.parts.antIdle, { svgOrigin: PIVOT_ANT });
    var allEyes = qa('[data-part="eye-left"],[data-part="eye-right"]');
    for (i = 0; i < allEyes.length; i++) {
      gsap.set(allEyes[i], { svgOrigin: allEyes[i].getAttribute('data-pivot') });
    }
    for (i = 0; i < mouths.length; i++) {
      gsap.set(mouths[i], { svgOrigin: mouths[i].getAttribute('data-pivot') });
    }
    for (i = 0; i < this.parts.eyeSpin.length; i++) {
      gsap.set(this.parts.eyeSpin[i], {
        svgOrigin: this.parts.eyeSpin[i].getAttribute('data-pivot')
      });
    }

    this.state = 'reposo';
    this.intensity = opts.intensity == null ? 1 : clamp(Number(opts.intensity) || 0, 0, 1.5);
    this.mouthOpen = 0;
    // La apertura se interpola sobre este objeto, no directamente sobre el
    // nodo: así el dibujo de boca puede seguir el valor intermedio y recorrer
    // los fotogramas por el camino, en lugar de saltar al destino.
    this._mouthProxy = { open: 0 };
    this.reduced = opts.reducedMotion == null
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : !!opts.reducedMotion;
    this.speaking = false;
    this.onChange = typeof opts.onChange === 'function' ? opts.onChange : null;

    // Contenedores de animación, uno por responsabilidad. Cada cambio de
    // estado los mata y los reconstruye: nada sobrevive para acumularse.
    this._tlBreath = null;
    this._tlSway = null;
    this._tlNod = null;
    this._tlAnt = null;
    this._tlTrans = null;
    this._blinkCall = null;
    this._tlBlink = null;
    this._speakCall = null;
    // El giro de las espirales no pertenece al ciclo ambiental: no lo toca la
    // intensidad ni un cambio de estado a medias, solo entrar o salir de
    // pensamiento y el movimiento reducido.
    this._tlSpin = null;
    this._tlSignal = null;

    this._applyStatics(this.state, 0);
    this._syncSpin();
    this._startAmbient();
    this._emit();
  }

  /* ----------------------- API pública ---------------------------------- */

  RobotAvatar.states = STATE_ORDER;
  RobotAvatar.stateInfo = function (name) {
    return Object.prototype.hasOwnProperty.call(STATES, name) ? STATES[name] : null;
  };

  /**
   * Cambia de estado. Se puede llamar en cualquier momento, incluso a mitad de
   * una transición: lo primero que hace es matar la transición anterior y los
   * bucles ambientales, de modo que nunca hay dos animaciones escribiendo la
   * misma propiedad.
   *
   * La expresión no se intercambia con un fundido ni cambiando de SVG. Los
   * trazados de las cinco expresiones tienen estructuras incompatibles
   * (tres familias de ojos, cinco bocas distintas), así que el cambio de
   * geometría ocurre en el instante en que los ojos están cerrados y la boca
   * recogida: un parpadeo real cubre el corte. Las siluetas de los extremos
   * son, byte a byte, las de los SVG originales.
   */
  RobotAvatar.prototype.setState = function (name, opts) {
    if (this._destroyed || !RobotAvatar.stateInfo(name)) return false;
    var o = opts || {};
    var instant = o.instant || this.reduced;
    var prev = this.state;
    this.state = name;

    this._stopAmbient();
    if (this._tlTrans) { this._tlTrans.kill(); this._tlTrans = null; }
    // El tween de apertura escribe la escala de la boca; si sobreviviera,
    // competiría con el cierre de boca de la transición.
    gsap.killTweensOf(this._mouthProxy);

    var sameEyes = STATES[prev].eyes === STATES[name].eyes &&
                   STATES[prev].lid === STATES[name].lid;
    var sameMouth = STATES[prev].mouth === STATES[name].mouth;

    // Al abandonar habla la boca vuelve a la silueta original del SVG. Si la
    // boca no cambia de geometría (reposo, escucha y habla comparten la de
    // main.svg) nadie la cerraría y se quedaría con la apertura del último
    // tic de la simulación.
    if (!STATES[name].speak && this.mouthOpen !== 0) {
      if (sameMouth) this.setMouthOpen(0, instant ? 0.01 : 0.2);
      else this.mouthOpen = 0;
    }

    if (instant) {
      this._swapGeometry(name);
      this._applyStatics(name, 0);
      this._startAmbient();
      this._emit();
      return true;
    }

    var self = this;
    var tl = gsap.timeline({
      onComplete: function () { self._tlTrans = null; self._startAmbient(); }
    });
    this._tlTrans = tl;

    var oldSet = this.parts.eyesets[STATES[prev].eyes];
    var oldMouth = this.parts.mouths[STATES[prev].mouth];

    // 1. Cierre: el parpadeo y el recogido de boca ocultan el cambio.
    if (!sameEyes) {
      tl.to(oldSet.eyes, { scaleY: 0.06, duration: 0.11, ease: 'power2.in' }, 0);
    }
    if (!sameMouth) {
      tl.to(oldMouth, { scaleY: 0.1, scaleX: 0.96, duration: 0.13, ease: 'power2.in' }, 0);
    }

    // 2. Intercambio de geometría en el punto ciego.
    tl.call(function () { self._swapGeometry(name); }, null, Math.max(sameEyes ? 0 : 0.11, sameMouth ? 0 : 0.13));

    // 3. Apertura a la silueta original exacta del nuevo estado.
    var newSet = this.parts.eyesets[STATES[name].eyes];
    var newMouth = this.parts.mouths[STATES[name].mouth];
    var openAt = Math.max(sameEyes ? 0 : 0.11, sameMouth ? 0 : 0.13);
    if (!sameEyes) {
      tl.fromTo(newSet.eyes, { scaleY: 0.06 },
        { scaleY: 1, duration: 0.2, ease: 'power2.out' }, openAt);
    }
    if (!sameMouth) {
      tl.fromTo(newMouth, { scaleY: 0.1, scaleX: 0.96 },
        { scaleY: 1, scaleX: 1, duration: 0.22, ease: 'power2.out' }, openAt);
    }

    // 4. Cabeza, cara y ojos van a su destino absoluto en paralelo, y la
    //    antena los sigue con retardo.
    this._applyStatics(name, 0.36, tl);

    this._emit();
    return true;
  };

  /**
   * Apertura de boca, 0 = cerrada, 1 = apertura máxima.
   *
   * En habla sitúa la boca dentro de la escalera de speak4..speak1 y deforma
   * la silueta interpolando entre los dos dibujos vecinos (0 = el más
   * cerrado, 1 = el más abierto); en los demás estados estira la silueta
   * original de ese estado. En ambos casos este método es el único escritor
   * de la apertura, así que el audio real entra por aquí sin tocar nada más.
   *
   * PUNTO DE ENGANCHE PARA AUDIO REAL: este es el único escritor de la
   * apertura de boca. Para gobernarla desde audio, detén la simulación con
   * stopSpeechSim() y llama aquí con la envolvente de amplitud del analizador:
   *
   *     const data = new Uint8Array(analyser.frequencyBinCount);
   *     function frame() {
   *       analyser.getByteFrequencyData(data);
   *       let sum = 0; for (const v of data) sum += v;
   *       bot.setMouthOpen((sum / data.length) / 128, 0.05);
   *       requestAnimationFrame(frame);
   *     }
   */
  RobotAvatar.prototype.setMouthOpen = function (value, duration) {
    if (this._destroyed) return this.mouthOpen;
    var open = clamp(Number(value) || 0, 0, 1);
    this.mouthOpen = open;

    var self = this;
    var mouth = this.parts.mouths[STATES[this.state].mouth];
    var range = parseFloat(mouth.getAttribute('data-range'));
    var xrange = parseFloat(mouth.getAttribute('data-xrange'));
    if (isNaN(range)) range = 0.45;
    if (isNaN(xrange)) xrange = -0.05;
    var framed = mouth === this.parts.mouths.speak;
    var dur = this.reduced ? 0.01 : (duration == null ? 0.12 : duration);

    // Un único tween escribe la apertura, y en cada fotograma de pantalla
    // aplica el valor intermedio a la escala y al dibujo. Por eso un salto de
    // 0,1 a 0,9 no cambia de golpe al último dibujo: pasa por los de en medio.
    gsap.to(this._mouthProxy, {
      open: open,
      duration: dur,
      ease: 'power1.out',
      overwrite: true,
      onUpdate: function () {
        var o = self._mouthProxy.open;
        gsap.set(mouth, { scaleY: 1 + o * range, scaleX: 1 + o * xrange });
        if (framed) self._syncMouth(o);
      }
    });
    return open;
  };

  /** Intensidad global de movimiento. 0 = quieto, 1 = nominal, 1.5 = máximo. */
  RobotAvatar.prototype.setIntensity = function (value) {
    if (this._destroyed) return this.intensity;
    this.intensity = clamp(Number(value) || 0, 0, 1.5);
    this._stopAmbient();
    this._applyStatics(this.state, this.reduced ? 0 : 0.3);
    this._startAmbient();
    return this.intensity;
  };

  /** Movimiento reducido: detiene los bucles y deja las expresiones intactas. */
  RobotAvatar.prototype.setReducedMotion = function (on) {
    if (this._destroyed) return this.reduced;
    this.reduced = !!on;
    this._stopAmbient();
    this._syncSpin();
    if (this._tlTrans) { this._tlTrans.kill(); this._tlTrans = null; }
    this._swapGeometry(this.state);
    // Una transición interrumpida puede dejar ojos/boca a medio cerrar.
    gsap.set(this.el.querySelectorAll('[data-part="eye-left"],[data-part="eye-right"]'), { scaleY: 1 });
    gsap.set(this.el.querySelectorAll('[data-part="mouth"]'), { scaleX: 1, scaleY: 1 });
    if (this.reduced) {
      // Posición neutra y exacta: ninguna animación residual.
      gsap.set(this.parts.root, { y: 0, scale: 1 });
      gsap.set(this.parts.sway, { rotation: 0 });
      gsap.set(this.parts.nod, { y: 0 });
      gsap.set(this.parts.antIdle, { rotation: 0 });
      gsap.set(this.parts.antLag, { rotation: 0 });
      this._applyStatics(this.state, 0);
      this.setMouthOpen(0, 0.01);
    } else {
      this._applyStatics(this.state, 0.3);
      this._startAmbient();
    }
    this._emit();
    return this.reduced;
  };

  /** Detiene la simulación de habla sin cambiar de estado. */
  RobotAvatar.prototype.stopSpeechSim = function () {
    if (this._destroyed) return;
    if (this._speakCall) { this._speakCall.kill(); this._speakCall = null; }
    this.speaking = false;
    this._emit();
  };

  /** Desactiva persistentemente la simulación para conectar audio real. */
  RobotAvatar.prototype.setSpeechSimulation = function (on) {
    if (this._destroyed) return;
    this.speechSimulation = !!on;
    this.stopSpeechSim();
    if (this.speechSimulation && STATES[this.state].speak && !this.reduced) {
      this._startSpeechSim();
    }
  };

  /** Vuelve al punto de partida: reposo, intensidad nominal, boca cerrada. */
  RobotAvatar.prototype.reset = function () {
    if (this._destroyed) return;
    this._stopAmbient();
    if (this._tlTrans) { this._tlTrans.kill(); this._tlTrans = null; }
    gsap.killTweensOf(this.el.querySelectorAll('g'));
    gsap.killTweensOf(this._mouthProxy);
    // killTweensOf ya ha parado el giro, pero hay que soltar la referencia o
    // _syncSpin creería que sigue activo y no lo rearmaría nunca más.
    this._tlSpin = null;
    this._resetMouthFrames();

    this.intensity = 1;
    this.mouthOpen = 0;
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.state = 'reposo';

    gsap.set(this.parts.root, { y: 0, scale: 1, svgOrigin: PIVOT_BODY });
    gsap.set(this.parts.sway, { rotation: 0, svgOrigin: PIVOT_NECK });
    gsap.set(this.parts.nod, { y: 0 });
    gsap.set(this.parts.headRig, { rotation: 0, svgOrigin: PIVOT_NECK });
    gsap.set(this.parts.face, { x: 0, y: 0 });
    gsap.set(this.parts.eyes, { scale: 1 });
    gsap.set(this.parts.antLag, { rotation: 0, svgOrigin: PIVOT_ANT });
    gsap.set(this.parts.antIdle, { rotation: 0, svgOrigin: PIVOT_ANT });

    var allEyes = this.el.querySelectorAll('[data-part="eye-left"],[data-part="eye-right"]');
    for (var i = 0; i < allEyes.length; i++) {
      gsap.set(allEyes[i], { scaleY: 1, svgOrigin: allEyes[i].getAttribute('data-pivot') });
    }
    for (i = 0; i < this.parts.eyeSpin.length; i++) {
      gsap.set(this.parts.eyeSpin[i], {
        rotation: 0, svgOrigin: this.parts.eyeSpin[i].getAttribute('data-pivot')
      });
    }
    for (var k in this.parts.mouths) {
      if (!Object.prototype.hasOwnProperty.call(this.parts.mouths, k)) continue;
      gsap.set(this.parts.mouths[k], {
        scaleY: 1, scaleX: 1, svgOrigin: this.parts.mouths[k].getAttribute('data-pivot')
      });
    }

    this._swapGeometry('reposo');
    this._applyStatics('reposo', 0);
    if (!this.reduced) this._startAmbient();
    this._emit();
  };

  /** Libera el componente por completo. */
  RobotAvatar.prototype.destroy = function () {
    if (this._destroyed) return;
    this._destroyed = true;
    this._stopAmbient();
    if (this._tlTrans) { this._tlTrans.kill(); this._tlTrans = null; }
    if (this._tlSpin) { this._tlSpin.kill(); this._tlSpin = null; }
    gsap.killTweensOf(this.el.querySelectorAll('*'));
    gsap.killTweensOf(this._mouthProxy);
    this.onChange = null;
    if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
  };

  /* ----------------------- Interno -------------------------------------- */

  RobotAvatar.prototype._emit = function () {
    if (!this.onChange) return;
    var s = STATES[this.state];
    this.onChange({
      state: this.state,
      label: s.label,
      hint: s.hint,
      speaking: this.speaking,
      reduced: this.reduced,
      intensity: this.intensity,
      mouthOpen: this.mouthOpen
    });
  };

  // Enciende la geometría del estado y apaga el resto. display:none, no
  // opacidad: no hay disolución en ningún momento.
  RobotAvatar.prototype._swapGeometry = function (name) {
    var s = STATES[name], key, set, i;
    for (key in this.parts.eyesets) {
      if (!Object.prototype.hasOwnProperty.call(this.parts.eyesets, key)) continue;
      set = this.parts.eyesets[key];
      set.group.classList.toggle('rb-off', key !== s.eyes);
      for (i = 0; i < set.lidHappy.length; i++) {
        set.lidHappy[i].classList.toggle('rb-off', s.lid !== 'happy');
      }
      for (i = 0; i < set.lidDoubt.length; i++) {
        set.lidDoubt[i].classList.toggle('rb-off', s.lid !== 'doubt');
      }
    }
    for (key in this.parts.mouths) {
      if (!Object.prototype.hasOwnProperty.call(this.parts.mouths, key)) continue;
      this.parts.mouths[key].classList.toggle('rb-off', key !== s.mouth);
    }
    // Al salir de habla la boca de habla queda oculta; se rearma en su primer
    // dibujo para que la próxima entrada no empiece a medio gesto.
    if (s.mouth !== 'speak') this._resetMouthFrames();
    // Se sincroniza aquí, en el mismo instante ciego en que cambia la
    // geometría: así el logo no se queda congelado a la vista durante el
    // cierre de ojos de la transición.
    this._syncSpin();
  };

  // Giro continuo de las espirales de la marca. Velocidad constante y sin
  // pausas: ni la intensidad ni las transiciones lo alteran. Solo lo detiene
  // salir de pensamiento o activar movimiento reducido, porque una rotación
  // perpetua es justo lo que esa preferencia pide eliminar.
  RobotAvatar.prototype._syncSpin = function () {
    var s = STATES[this.state];
    var wanted = !!s.spin && !this.reduced;

    if (!wanted) {
      if (this._tlSpin) { this._tlSpin.kill(); this._tlSpin = null; }
      return;
    }
    if (this._tlSpin) return; // ya girando: no se reinicia ni se reengancha

    this._tlSpin = gsap.to(this.parts.eyeSpin, {
      rotation: '+=360',
      duration: s.spin,
      ease: 'none',
      repeat: -1
    });
  };

  /* --------------------------------------------------------------------
     Boca de habla: deformación continua, sin relevos ni cruces.

     La apertura sitúa un punto dentro de la escalera (0 = primer dibujo,
     1 = último). Todo se recalcula en ese punto interpolando entre los dos
     dibujos vecinos, coordenada a coordenada, en cada fotograma de pantalla:
     a mitad de camino entre dos dibujos la boca tiene una forma que no es
     ninguno de los dos, es la de en medio.

     Las cinco piezas salen de los mismos dos números interpolados, así que
     van siempre en fase: el blanco, el recorte y el contorno comparten
     silueta, y el relleno inferior y el labio comparten la línea de labio.
     Ninguna pieza aparece ni desaparece, de modo que no hay ningún instante
     en que pueda verse un hueco.
     -------------------------------------------------------------------- */
  RobotAvatar.prototype._syncMouth = function (open) {
    var last = SHELL.length - 1;
    var p = clamp(open, 0, 1) * last;
    var i = Math.min(last - 1, Math.floor(p));   // dibujo de partida
    var t = p - i;                               // 0..1 entre i e i+1

    var shell = buildShell(SHELL[i], SHELL[i + 1], t);
    this.parts.mouthFill.setAttribute('d', shell);
    this.parts.mouthStroke.setAttribute('d', shell);
    this.parts.mouthClip.setAttribute('d', shell);
    this.parts.mouthLower.setAttribute('d', buildLower(LIP[i], LIP[i + 1], t));
    this.parts.mouthLip.setAttribute('d', buildLip(LIP[i], LIP[i + 1], t));
  };

  // Vuelve al primer dibujo (boca casi cerrada). Se llama con la boca de habla
  // oculta, para que al volver a habla no arranque a medio gesto.
  RobotAvatar.prototype._resetMouthFrames = function () {
    this._mouthProxy.open = 0;
    this._syncMouth(0);
  };

  // Destinos absolutos de inclinación, cara y ojos. Siempre absolutos, nunca
  // relativos: por eso una interrupción no deja desplazamiento acumulado.
  RobotAvatar.prototype._applyStatics = function (name, duration, timeline) {
    var s = STATES[name];
    var k = this.reduced ? 0 : this.intensity;
    var dur = this.reduced ? 0 : duration;
    var ctx = timeline || gsap;
    var at = timeline ? 0 : undefined;

    var tilt = s.tilt * k;
    var fx = s.face[0] * k, fy = s.face[1] * k;
    var scale = 1 + (s.eyeScale - 1) * k;

    if (!dur) {
      gsap.set(this.parts.headRig, { rotation: tilt });
      gsap.set(this.parts.face, { x: fx, y: fy });
      gsap.set(this.parts.eyes, { scale: scale });
      gsap.set(this.parts.antLag, { rotation: 0 });
      return;
    }

    ctx.to(this.parts.headRig, {
      rotation: tilt, duration: dur, ease: 'power2.out', overwrite: 'auto'
    }, at);
    ctx.to(this.parts.face, {
      x: fx, y: fy, duration: dur * 1.1, ease: 'power2.out', overwrite: 'auto'
    }, at);
    ctx.to(this.parts.eyes, {
      scale: scale, duration: dur, ease: 'power2.out', overwrite: 'auto'
    }, at);

    // Retardo de la antena: arranca más tarde, tarda más y rebasa un poco.
    // Es la única reacción al cambio de inclinación, así que no compite con
    // la vibración ambiental, que vive en otro grupo.
    ctx.fromTo(this.parts.antLag,
      { rotation: -tilt * 0.45 },
      {
        rotation: 0, duration: dur * 1.5, ease: 'back.out(1.6)',
        overwrite: 'auto'
      },
      at == null ? undefined : at + 0.1
    );
  };

  RobotAvatar.prototype._startAmbient = function () {
    if (this.reduced || this._destroyed) return;
    var s = STATES[this.state];
    var k = this.intensity;

    // Intensidad cero: no basta con no arrancar los bucles, hay que devolver
    // los grupos ambientales a cero o se quedarían congelados a mitad de su
    // último recorrido.
    if (k <= 0.001) {
      gsap.to([this.parts.root, this.parts.sway, this.parts.nod],
        { y: 0, rotation: 0, scale: 1, duration: 0.3, ease: 'power2.out', overwrite: 'auto' });
      gsap.to(this.parts.antIdle,
        { rotation: 0, duration: 0.4, ease: 'power2.out', overwrite: 'auto' });
      this._restSparks();
      this._scheduleBlink();
      return;
    }

    // Respiración: el único escritor de y/scale en la raíz.
    this._tlBreath = gsap.timeline({ repeat: -1, yoyo: true })
      .to(this.parts.root, {
        y: -7 * k, scale: 1 + 0.006 * k,
        duration: 1.6, ease: 'sine.inOut'
      });

    // Balanceo: el único escritor de rotation en rb-sway.
    this._tlSway = gsap.timeline({ repeat: -1, yoyo: true })
      .to(this.parts.sway, {
        rotation: s.sway * k,
        duration: s.swayTime / 2, ease: 'sine.inOut'
      });

    // Vibración de antena: el único escritor de rotation en rb-ant-idle.
    this._tlAnt = gsap.timeline({ repeat: -1, yoyo: true })
      .to(this.parts.antIdle, {
        rotation: s.antIdle * k,
        duration: s.antTime / 2, ease: 'sine.inOut'
      });

    // Cabeceo: solo en habla, el único escritor de y en rb-nod.
    if (s.nod) {
      this._tlNod = gsap.timeline({ repeat: -1, yoyo: true })
        .to(this.parts.nod, {
          y: s.nod * k, duration: 0.55, ease: 'sine.inOut'
        });
    }

    this._startSignal(s.signal, k);
    this._scheduleBlink();
    if (s.speak && this.speechSimulation) this._startSpeechSim();
  };

  RobotAvatar.prototype._stopAmbient = function () {
    ['_tlBreath', '_tlSway', '_tlNod', '_tlAnt', '_tlSignal'].forEach(function (key) {
      if (this[key]) { this[key].kill(); this[key] = null; }
    }, this);
    if (this._blinkCall) { this._blinkCall.kill(); this._blinkCall = null; }
    if (this._tlBlink) {
      this._tlBlink.kill();
      this._tlBlink = null;
      gsap.set(this.el.querySelectorAll('[data-part="eye-left"],[data-part="eye-right"]'), { scaleY: 1 });
    }
    if (this._speakCall) { this._speakCall.kill(); this._speakCall = null; }
    this.speaking = false;
  };

  /* --------------------------------------------------------------------
     Cadena de señal de la antena.

     Los tres destellos son rayos de longitud idéntica que irradian del bulbo
     a 13°, -45° y -85°. El pulso recorre el abanico en cadena y cada rayo, en
     su turno, se enciende y se desplaza a lo largo de SU PROPIO eje: hacia
     fuera cuando el robot emite, hacia dentro cuando recibe. Ese
     desplazamiento es lo que distingue una cosa de la otra, y el orden de la
     cadena se invierte también para reforzarlo.

     El pulso dura lo mismo en todos los estados; lo que cambia por estado es
     cada cuánto se repite (cycle) y cuánto recorrido tiene (reach). Así un
     ciclo largo da un destello nítido con mucho silencio detrás, en lugar de
     un destello lento y blando.

     La señal es parte del ciclo ambiental: la intensidad escala el recorrido
     y el movimiento reducido la apaga. Apagada, los tres rayos vuelven a su
     sitio y a opacidad 1, que es el dibujo original de los archivos.
     -------------------------------------------------------------------- */
  var SIGNAL_RISE = 0.22;   // encendido de un rayo
  var SIGNAL_FALL = 0.38;   // apagado, más largo: deja estela
  var SIGNAL_STEP = 0.11;   // retardo de un rayo al siguiente en la cadena

  RobotAvatar.prototype._startSignal = function (cfg, k) {
    var sparks = this.parts.sparks;
    var n = sparks.length;
    if (!cfg || !cfg.dir || !n) { this._restSparks(); return; }

    var tl = gsap.timeline({ repeat: -1 });

    for (var i = 0; i < n; i++) {
      // Emitir recorre el abanico de la horizontal hacia arriba; recibir lo
      // recorre al revés, como si el pulso llegara de fuera.
      var el = sparks[cfg.dir > 0 ? i : n - 1 - i];
      var u = el.getAttribute('data-dir').split(' ');
      var reach = cfg.reach * k * cfg.dir;
      var at = i * SIGNAL_STEP;

      tl.to(el, {
        opacity: 1,
        x: parseFloat(u[0]) * reach,
        y: parseFloat(u[1]) * reach,
        duration: SIGNAL_RISE, ease: 'power2.out', overwrite: 'auto'
      }, at)
        .to(el, {
          opacity: SIGNAL_DIM, x: 0, y: 0,
          duration: SIGNAL_FALL, ease: 'power2.in', overwrite: 'auto'
        }, at + SIGNAL_RISE);
    }

    // Lo que falta hasta completar el ciclo es el silencio entre pulsos.
    tl.repeatDelay(Math.max(0, cfg.cycle - tl.duration()));
    this._tlSignal = tl;
  };

  // Devuelve los destellos a su posición y opacidad originales.
  RobotAvatar.prototype._restSparks = function () {
    if (this._tlSignal) { this._tlSignal.kill(); this._tlSignal = null; }
    gsap.to(this.parts.sparks, {
      opacity: 1, x: 0, y: 0,
      duration: this.reduced ? 0.01 : 0.3,
      ease: 'power2.out', overwrite: 'auto'
    });
  };

  RobotAvatar.prototype._scheduleBlink = function () {
    if (this._destroyed || this.reduced) return;
    var self = this;
    var s = STATES[this.state];
    if (!s.blink) return; // pensamiento: las espirales giran, no parpadean
    var wait = rand(s.blink[0], s.blink[1]) / Math.max(0.4, this.intensity);
    this._blinkCall = gsap.delayedCall(wait, function () {
      self._blinkCall = null;
      if (self._destroyed || self.reduced) return;
      var eyes = self.parts.eyesets[STATES[self.state].eyes].eyes;
      var tl = gsap.timeline({ onComplete: function () { self._tlBlink = null; self._scheduleBlink(); } });
      self._tlBlink = tl;
      tl.to(eyes, { scaleY: 0.08, duration: 0.08, ease: 'power2.in' })
        .to(eyes, { scaleY: 1, duration: 0.13, ease: 'power2.out' });
      // Un parpadeo doble de vez en cuando: evita el patrón mecánico.
      if (Math.random() < 0.22) {
        tl.to(eyes, { scaleY: 0.1, duration: 0.07, ease: 'power2.in' }, '+=0.09')
          .to(eyes, { scaleY: 1, duration: 0.12, ease: 'power2.out' });
      }
    });
  };

  /* --------------------------------------------------------------------
     SIMULACIÓN DE HABLA — no es audio.
     Genera una envolvente plausible: ráfagas de 2 a 6 aperturas seguidas
     (las "sílabas") separadas por pausas. Escribe exclusivamente a través de
     setMouthOpen(), que es el mismo método que usará el audio real, así que
     sustituir esta simulación no toca el rig.
     -------------------------------------------------------------------- */
  RobotAvatar.prototype._startSpeechSim = function () {
    if (this._destroyed || !this.speechSimulation || this.reduced) return;
    this.speaking = true;
    this._emit();
    this._speechBurst(Math.round(rand(2, 6)));
  };

  RobotAvatar.prototype._speechBurst = function (left) {
    var self = this;
    var k = clamp(this.intensity, 0.1, 1.5);

    if (left <= 0) {
      // Pausa entre frases: la boca vuelve a la silueta original.
      this.setMouthOpen(0.04 * k, 0.16);
      this._speakCall = gsap.delayedCall(rand(0.32, 0.72), function () {
        if (!self.speaking) return;
        self._speechBurst(Math.round(rand(2, 6)));
      });
      return;
    }

    var open = rand(0.22, 0.95) * k;
    var dur = rand(0.09, 0.2);
    this.setMouthOpen(open, dur);
    // Espera mínima entre sílabas: ahora que la boca se deforma de verdad, un
    // reposo largo aquí se nota como un congelado. Las pausas de respiración
    // las pone el hueco entre frases, no el hueco entre sílabas.
    this._speakCall = gsap.delayedCall(dur + rand(0.01, 0.05), function () {
      if (!self.speaking) return;
      self._speechBurst(left - 1);
    });
  };

  return RobotAvatar;
});
