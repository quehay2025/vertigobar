/* ============================================================
   TRIBU GASTRO PUB - CONFIGURACION DEL SITIO
   Todo lo que cambia (datos, enlaces, textos) vive aqui.
   Lo que dejes vacio ("") se oculta solo en la pagina.
   ============================================================ */
window.TRIBU = {
  // Apertura: viernes 4 de diciembre de 2026, 19:00 hora de Ecuador (UTC-5)
  // (cambia SOLO esta linea si la fecha es otra)
  openAt: "2026-12-04T19:00:00-05:00",

  name: "TRIBU GASTRO PUB",
  tagline: "Comida, fuego y música en vivo. Aquí se junta la tribu.",

  // WhatsApp: solo numeros con codigo de pais, sin + ni espacios. Ej: 593991234567
  whatsapp: "593985912339",
  whatsappMessage: "Hola TRIBU, quiero información.",

  phone: "098 591 2339",
  email: "",               // PENDIENTE
  address: "Av. Guaytambos y Magnolias",
  mapQuery: "Av. Guaytambos y Magnolias, Ambato, Ecuador",

  // Horarios: lista de [dia, horario]. Vacia = se oculta el bloque.
  hours: [
    // ["Jueves a sábado", "19:00 - 00:00"],
  ],

  // Redes sociales (URL completa). Vacia = no se muestra el icono.
  social: {
    instagram: "https://instagram.com/tribugastropub",
    facebook: "",          // PENDIENTE
    tiktok: ""             // PENDIENTE
  },

  // Enlace del menu (app o PDF). Se usa en todos los botones "Ver menú".
  menuUrl: "https://open.quehayapp.com/u/tribugastropub/menu",

  // Reservas: enlace de la app para reservar (por ahora el menu; cambialo cuando tengas el enlace de reservas)
  reservaUrl: "https://open.quehayapp.com/u/tribugastropub/menu",
  // "Dejanos tu informacion": URL que reciba los datos (POST JSON). Vacio = llega por WhatsApp
  contactEndpoint: "",

  // Votacion en vivo (ya funciona)
  arcadeUrl: "https://arcade.tribugastropub.com/vota",

  // Quienes somos (puedes reemplazar estos textos)
  about: {
    title: "Somos la tribu",
    paragraphs: [
      "TRIBU Gastro Pub nace para reunir a la gente alrededor de la buena comida, los tragos bien servidos y la música en vivo.",
      "Cada noche el público vota las canciones y la pista responde. Aquí no se mira desde afuera: se participa."
    ],
    highlights: [
      { t: "Cocina", d: "Platos para compartir, hechos al momento." },
      { t: "Bar", d: "Cervezas, cocteles y tragos de la casa." },
      { t: "En vivo", d: "DJs y artistas, con votación del público." }
    ]
  },

  // Galeria: lista de rutas de imagen, ej: "/tribu/assets/galeria/01.jpg". Vacia = marcos decorativos.
  gallery: [
    "/tribu/assets/galeria/sabores.jpg",
    "/tribu/assets/galeria/cocteleria.jpg",
    "/tribu/assets/galeria/alta-cocina.jpg",
    "/tribu/assets/galeria/ambiente.jpg"
  ],

  // Cenas navideñas (del PDF del menu). Para ocultar la seccion: christmas: null
  christmas: {
    title: "Cenas Navideñas",
    intro: "Tres opciones de tres tiempos para celebrar la temporada. Todas se sirven acompañadas de bebida de jamaica con frutos rojos y copa de vino.",
    note: "¡Reservas disponibles!",
    options: [
      { name: "Opción 1", price: "$14,99", entrada: "Tamal navideño de gallina",
        fuerte: ["Medallones de pollo rellenos de queso gouda, jamón cocido y baby espinaca, bañados en salsa de fruta de la pasión"],
        sides: "Papa al horno con costra de queso, ensalada San Nicolás y arroz navideño de la casa", postre: "Cheesecake de frutos rojos" },
      { name: "Opción 2", price: "$19,99", entrada: "Tamal navideño de gallina",
        fuerte: ["Medallones de pavo rellenos de farsa de carne con frutos secos y fruta confitada, bañados en salsa de vino blanco"],
        sides: "Papa suiza dorada al horno, ensalada Waldorf y arroz tres delicias", postre: "Mousse de maracuyá" },
      { name: "Opción 3", price: "$29,99", entrada: "Tamal navideño de gallina",
        fuerte: ["Medallones de pavo rellenos de queso holandés, jamón cocido y frutos del bosque, bañados en salsa de melocotón y ciruela", "Medallón de cerdo relleno de farsa de carne con higo, bañado en salsa de finas hierbas"],
        sides: "Papa crema rostizada al horno, ensalada Waldorf y arroz aromatizado al curry con tocino y nuez", postre: "Tiramisú" }
    ]
  }
};
