// Arquivo do Figma no formato da API REST, usado pelos testes do scan e do modelo.

export const solid = (r, g, b, a = 1) => ({ type: 'SOLID', color: { r, g, b, a } });

export function restFile() {
  return {
    name: 'Digital Agency Company',
    document: {
      id: '0:0', type: 'DOCUMENT', children: [
        {
          id: '0:1', name: 'Design', type: 'CANVAS', backgroundColor: { r: 0.118, g: 0.118, b: 0.118, a: 1 }, children: [
            {
              id: '1:1', name: 'Home Page - Laptop', type: 'FRAME', absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 5000 },
              fills: [solid(0.043, 0.043, 0.043)], styles: { fill: 'S:bg' }, layoutMode: 'VERTICAL', itemSpacing: 120,
              paddingTop: 40, paddingBottom: 40, paddingLeft: 80, paddingRight: 80,
              children: [
                {
                  id: '1:2', name: 'Hero title', type: 'TEXT', characters: 'We build digital products', absoluteBoundingBox: { width: 900, height: 192 },
                  fills: [solid(1, 1, 1)], styles: { text: 'S:h1', fill: 'S:white' },
                  style: { fontFamily: 'Barlow', fontWeight: 600, fontSize: 80, lineHeightPx: 96, lineHeightUnit: 'PIXELS', letterSpacing: -1.6, textCase: 'ORIGINAL' },
                },
                {
                  id: '1:3', name: 'Button', type: 'FRAME', absoluteBoundingBox: { width: 180, height: 56 }, cornerRadius: 8,
                  fills: [solid(0.776, 0.957, 0.196)], styles: { fill: 'S:green' }, layoutMode: 'HORIZONTAL', itemSpacing: 10,
                  paddingTop: 18, paddingBottom: 18, paddingLeft: 30, paddingRight: 30,
                  effects: [{ type: 'DROP_SHADOW', visible: true, color: { r: 0, g: 0, b: 0, a: 0.25 }, offset: { x: 0, y: 4 }, radius: 8, spread: 0 }],
                  interactions: [{ trigger: { type: 'ON_HOVER' }, actions: [{ type: 'NODE', transition: { type: 'SMART_ANIMATE', duration: 0.3, easing: { type: 'GENTLE' } } }] }],
                  children: [
                    { id: '1:4', name: 'Label', type: 'TEXT', characters: 'Get Started', fills: [solid(0.1, 0.1, 0.1)], style: { fontFamily: 'Barlow', fontWeight: 500, fontSize: 18, lineHeightPercentFontSize: 150, lineHeightUnit: 'FONT_SIZE_%', letterSpacing: 0 } },
                    { id: '1:5', name: 'icon/arrow', type: 'VECTOR', absoluteBoundingBox: { width: 24, height: 24 }, strokes: [solid(0.1, 0.1, 0.1)], strokeWeight: 2 },
                  ],
                },
                { id: '1:6', name: 'Photo', type: 'RECTANGLE', absoluteBoundingBox: { width: 600, height: 400 }, cornerRadius: 12, fills: [{ type: 'IMAGE', imageRef: 'abc123', scaleMode: 'FILL' }] },
                {
                  id: '1:7', name: 'Gradient', type: 'RECTANGLE', absoluteBoundingBox: { width: 100, height: 100 },
                  fills: [{ type: 'GRADIENT_LINEAR', gradientHandlePositions: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }, { x: 0, y: 1 }], gradientStops: [{ position: 0, color: { r: 1, g: 0, b: 0, a: 1 } }, { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } }] }],
                },
                { id: '1:8', name: 'Hidden', type: 'TEXT', visible: false, characters: 'x', style: { fontFamily: 'Comic Sans', fontSize: 99 } },
              ],
            },
            { id: '2:1', name: 'Home Page - Mobile', type: 'FRAME', absoluteBoundingBox: { width: 390, height: 3000 }, fills: [solid(0.043, 0.043, 0.043)], children: [] },
            { id: '3:1', name: 'Contact Page - Laptop', type: 'FRAME', absoluteBoundingBox: { width: 1440, height: 2000 }, children: [] },
            { id: '3:2', name: 'Contact Page - Mobile', type: 'FRAME', absoluteBoundingBox: { width: 390, height: 2000 }, children: [] },
          ],
        },
        {
          id: '0:2', name: 'Icons', type: 'CANVAS', children: [
            { id: '9:1', name: 'Board', type: 'FRAME', absoluteBoundingBox: { width: 800, height: 600 }, children: [{ id: '9:2', name: 'Facebook', type: 'COMPONENT', absoluteBoundingBox: { width: 24, height: 24 }, children: [] }] },
          ],
        },
      ],
    },
    components: { '9:2': { name: 'Facebook', description: 'Ícone social' } },
    styles: {
      'S:bg': { name: 'Grey/Grey 10', styleType: 'FILL' },
      'S:white': { name: 'Absolute/White', styleType: 'FILL' },
      'S:green': { name: 'Green/Green 60', styleType: 'FILL' },
      'S:h1': { name: 'Heading/H1', styleType: 'TEXT' },
    },
  };
}
