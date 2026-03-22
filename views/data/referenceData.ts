/**
 * Reference data for image prompt building — art styles, artists, emotions.
 * Extracted from process-midjourney-images source files.
 */

export interface ReferenceCategory {
  key: string;
  label: string;
  items: string[];
}

const artStyles = [
  "Abstract Expressionism", "Art Deco", "Art Nouveau", "Avant-garde", "Baroque",
  "Bauhaus", "Classicism", "CoBrA", "Color Field Painting", "Conceptual Art",
  "Constructivism", "Cubism", "Dada", "Dadaism", "Digital Art", "Expressionism",
  "Fauvism", "Futurism", "Harlem Renaissance", "Hypersurrealism", "Impressionism",
  "Installation Art", "Land Art", "Minimalism", "Neo-Impressionism", "Neoclassicism",
  "Neon Art", "Op Art", "Pen and Ink", "Performance Art", "Pop Art",
  "Post-Impressionism", "Precisionism", "Rococo", "Street Art", "Suprematism",
  "Surrealism", "Symbolism", "Watercolor", "Zero Group",
];

const designStyles = [
  "Minimalist", "Rustic", "Bohemian", "Industrial", "Mid-century Modern",
  "Contemporary", "Traditional", "Scandinavian", "Coastal", "Farmhouse",
  "Shabby Chic", "Art Deco", "Transitional", "Eclectic", "Modern",
  "Gothic", "Colonial", "Victorian", "Tuscan", "Mediterranean",
];

const animeArtists = [
  "Hayao Miyazaki", "Mamoru Hosoda", "Makoto Shinkai", "Naoko Takeuchi",
  "Yoshiyuki Tomino", "Isao Takahata", "Kunihiko Ikuhara", "Hideaki Anno",
  "Akiyuki Shinbo", "Hiroyuki Imaishi", "Satoshi Kon", "Rumiko Takahashi",
  "Osamu Tezuka", "Mitsuo Iso", "Yoshitoshi ABe", "Yoko Kanno",
  "Yoshitaka Amano", "Shinichiro Watanabe", "Kenji Kamiyama", "Junichi Sato",
];

const illustrators = [
  "Alphonse Mucha", "Akihiko Yoshida", "Sakimichan", "Krenz Cushart",
  "Kuvshinov Ilya", "Salomon van Abbé", "Esao Andrews", "Rolf Armstrong",
  "Lois van Baarle", "Tom Bagshaw", "Karol Bak", "Cicely Mary Barker",
  "Aubrey Beardsley", "Zdzisław Beksiński", "Julie Bell", "Simon Bisley",
  "William Blake", "Enoch Bolles", "William-Adolphe Bouguereau", "Charlie Bowater",
  "Aleksi Briclot", "Gerald Brom", "Gaston Bussière", "Frank Cho",
  "Richard Corben", "Craig Davison", "Pino Daeni", "Leo and Diane Dillon",
  "Philippe Druillet", "Jeff Easley", "Les Edwards", "Roberto Ferri",
  "Frank Frazetta", "Jack Gaughan", "Stefan Gesell", "Charles Dana Gibson",
  "Warwick Goble", "Edward Gorey", "Carne Griffiths", "Rebecca Guay",
  "Ryohei Hase", "Ryan Hewett", "Stephen Hickman", "Greg Hildebrandt",
  "Adam Hughes", "Howard David Johnson", "Jeffrey Catherine Jones", "Ken Kelly",
  "Bastien Lecouffe-Deharme", "J.C. Leyendecker", "Milo Manara", "Dave McKean",
  "Kelly McKernan", "Ian Miller", "Russ Mills", "Patrick Nagel",
  "Terese Nielsen", "Michael Parkes", "Coles Phillips", "Arthur Rackham",
  "Conrad Roset", "Luis Royo", "Apollonia Saintclair", "Jeff Simpson",
  "Anne Stokes", "Boris Vallejo", "Alberto Vargas", "Tillie Walden",
  "Gerda Wegener", "Michael Whelan", "Coby Whitmore",
];

const photographers = [
  "Robert Capa", "Henri Cartier-Bresson", "Dorothea Lange", "Annie Leibovitz",
  "Ansel Adams", "Richard Avedon", "Robert Frank", "Diane Arbus", "Man Ray",
  "Steve McCurry", "Edward Weston", "Cindy Sherman", "Robert Doisneau",
  "David LaChapelle", "Elliott Erwitt", "Robert Mapplethorpe", "W. Eugene Smith",
  "Imogen Cunningham", "Weegee", "Garry Winogrand", "Vivian Maier",
  "Walker Evans", "Andreas Gursky", "David Bailey", "Irving Penn",
  "Philippe Halsman", "André Kertész", "Yousuf Karsh", "Paul Strand",
  "Frans Lanting", "Helmut Newton", "Mary Ellen Mark", "Don McCullin",
  "Margaret Bourke-White", "Alfred Stieglitz", "Eve Arnold", "Sebastião Salgado",
  "Martin Parr", "Arnold Newman", "Edward Steichen", "Bruce Davidson",
  "Gerda Taro", "William Eggleston", "Alfred Eisenstaedt", "Herbert List",
  "Nan Goldin", "Guy Bourdin", "Jacques Henri Lartigue", "Anne Geddes",
  "Peter Lindbergh", "James Nachtwey",
];

const masterArtists = [
  "Vincent van Gogh — The Starry Night, Sunflowers, Almond Blossom",
  "Leonardo da Vinci — The Last Supper, Mona Lisa, The Vitruvian Man",
  "Michelangelo — David, The Sistine Chapel Ceiling, Pieta",
  "Rembrandt — The Night Watch, Self Portrait with Two Circles",
  "Pablo Picasso — Les Demoiselles d'Avignon, The Old Guitarist, Guernica",
];

const comicArtists = [
  "Horacio Altuna", "Alberto Breccia", "Enrique Breccia", "Roberto Fontanarrosa",
  "Juan Gimenez", "Guillermo Mordillo", "José Antonio Muñoz", "Quino",
  "Eduardo Risso", "Francisco Solano López", "Hergé", "André Franquin",
  "Edgar P. Jacobs", "Morris", "Peyo", "Jean Giraud (Moebius)", "Enki Bilal",
  "François Schuiten", "Hugo Pratt", "Milo Manara", "Guido Crepax",
  "Sergio Toppi", "Lorenzo Mattotti", "Dave Gibbons", "Alan Moore",
  "Frank Quitely", "Bryan Talbot", "Dave McKean", "Jamie Hewlett",
  "Kevin O'Neill", "Neil Gaiman", "Grant Morrison", "Mark Millar",
  "Garth Ennis", "Warren Ellis", "Jim Lee", "Frank Miller",
  "Carlos Ezquerra", "Jordi Bernet", "Juanjo Guarnido", "Jean-Claude Mézières",
  "Philippe Druillet", "Jacques Tardi", "François Bourgeon", "Régis Loisel",
  "Lewis Trondheim", "Joann Sfar", "Bastien Vivès", "Claire Bretécher",
  "Grzegorz Rosiński", "Jean Van Hamme", "Hermann", "Vittorio Giardino",
  "Paolo Eleuteri Serpieri", "Tanino Liberatore", "Andrea Pazienza",
  "Romano Scarpa", "Giorgio Cavazzano", "Tove Jansson", "Osamu Tezuka",
];

const emotions = [
  "Joy", "Sadness", "Anger", "Fear", "Surprise", "Disgust", "Contempt",
  "Envy", "Guilt", "Shame", "Confusion", "Curiosity", "Embarrassment",
  "Excitement", "Happiness", "Hope", "Love", "Nostalgia", "Pride", "Relief",
  "Satisfaction", "Amusement", "Anxiety", "Awe", "Bitterness", "Calm",
  "Compassion", "Depression", "Desire", "Doubt", "Ecstasy", "Empathy",
  "Enthusiasm", "Euphoria", "Frustration", "Gratitude", "Grief", "Hate",
  "Helplessness", "Hostility", "Impatience", "Insecurity", "Interest",
  "Jealousy", "Loneliness", "Longing", "Melancholy", "Misery", "Numbness",
  "Optimism", "Overwhelmed", "Panic", "Passion", "Pessimism", "Powerlessness",
  "Regret", "Remorse", "Resentment", "Serenity", "Sorrow", "Spite", "Stress",
  "Suspicion", "Tenderness", "Terror", "Uncertainty", "Vulnerability", "Worry",
  "Zeal", "Alienation", "Apathy", "Bewilderment", "Contentment", "Delight",
  "Dismay", "Elation", "Empowerment", "Exhilaration", "Fascination",
  "Fulfillment", "Fury", "Indignation", "Inspiration", "Intimidation",
  "Jubilation", "Lust", "Nervousness", "Outrage", "Rapture", "Relaxation",
  "Reluctance", "Resignation", "Revulsion", "Shyness",
];

export const referenceCategories: ReferenceCategory[] = [
  { key: 'art-styles', label: 'Art Styles', items: artStyles },
  { key: 'design-styles', label: 'Design Styles', items: designStyles },
  { key: 'illustrators', label: 'Illustrators', items: illustrators },
  { key: 'photographers', label: 'Photographers', items: photographers },
  { key: 'anime-artists', label: 'Anime Artists', items: animeArtists },
  { key: 'master-artists', label: 'Master Artists', items: masterArtists },
  { key: 'comic-artists', label: 'Comic Artists', items: comicArtists },
  { key: 'emotions', label: 'Emotions', items: emotions },
];
