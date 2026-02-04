# Auditoría: Play23 Bet Placement API

## Resumen Ejecutivo

**Estado: ⚠️ PARCIALMENTE FUNCIONAL**

La aplicación puede:
- ✅ Login exitoso con credenciales wwplayer1/123
- ✅ Obtener odds en tiempo real del API JSON de Play23
- ✅ Compilar apuestas (CreateWagerHelper.aspx)
- ❌ Confirmar apuestas (ConfirmWagerHelper.aspx) - FALLA

## Problema Principal

El endpoint `ConfirmWagerHelper.aspx` rechaza el formato de `detailData` con el error:
```
"Input string was not in a correct format"
```

### Análisis del Código Frontend de Play23

Analizando el bundle JavaScript de Play23 (3.7MB), encontré la función `Up()` que construye el `detailData`:

```javascript
// Frontend construye detailData así:
{
  Amount: 25,
  RiskWin: 0,           // Integer, no string
  TeaserPointsPurchased: 0,
  IdGame: 5421290,
  Play: 0,
  Pitcher: 0,
  Points: {             // Objeto PointMessage
    BuyPoints: 0,
    BuyPointsDesc: "",
    LineDesc: "",
    selected: true
  }
}
```

### Pruebas Realizadas

| Formato de detailData | Resultado |
|----------------------|-----------|
| `{ IdGame, Play, Amount, RiskWin: "0" }` | "Input string was not in a correct format" |
| `{ IdGame, Play, Points: 4.5, Amount }` | "Error converting value 4.5 to PointMessage" |
| `{ IdGame, Play, Points: "4.5" }` | "Error converting value '4.5' to PointMessage" |
| `{ IdGame, Play, Points: { Value: 4.5 } }` | "Input string was not in a correct format" |
| `{ IdGame, Play, Points: { BuyPoints: 0, ... } }` | "Input string was not in a correct format" |
| `{ IdGame, Play, RiskWin: "W" }` | "Could not convert string to integer: W" |
| Sin detailData (vacío) | "Value cannot be null" |

### Hipótesis

1. **Protección Anti-Bot**: Play23 puede tener validación adicional en el servidor que detecta requests que no vienen del frontend oficial (cookies de sesión, timing, headers específicos).

2. **Versión del API**: El API puede haber cambiado y el código del frontend que analicé es de una versión diferente.

3. **Campo faltante**: Puede existir un campo adicional requerido que no identificamos en el análisis del JavaScript minificado.

## Qué SÍ Funciona

El proyecto puede:
1. Mostrar odds reales de Play23
2. Autenticar usuarios
3. Mostrar balance de cuenta
4. Generar selection strings correctos para apuestas

## Recomendación

Para que las apuestas funcionen desde el dashboard local, se necesita:

1. **Opción A - Browser Automation**: Usar Playwright/Puppeteer para controlar el navegador real y hacer clic en los botones de apuesta (más lento pero más confiable)

2. **Opción B - Captura de Network**: Usar DevTools del navegador para capturar una request exitosa de ConfirmWager y analizar exactamente qué envía el frontend

3. **Opción C - Contactar Play23**: Si esta es una integración oficial, solicitar documentación del API

## Archivos de Prueba Creados

- `test-live-bet.js` - Prueba con datos reales
- `test-debug-confirm.js` - Debug del paso Confirm
- `test-confirm-formats.js` - Prueba diferentes formatos
- `test-final-format.js` - Formato exacto del frontend
- `fetch-logged-in.js` - Análisis del frontend JS

## Conclusión

El flujo de 3 pasos (Compile → Confirm → Post) es correcto, pero el formato específico del `detailData` que acepta Play23 no se ha podido replicar exactamente. El endpoint tiene validación estricta que rechaza formatos que difieren del esperado.

**La aplicación funciona para mostrar odds y datos, pero no puede ejecutar apuestas reales sin resolver el formato exacto de detailData.**
