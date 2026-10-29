// The services a patching schedule carries (data, voice, video…): the colour
// of their cords and labels, and what cutting them costs.

export interface Service {
  name: string;
  color: string;
  /** what a second of this service cut costs from the downtime budget */
  weight: number;
  /** what it carries, and who notices when it is cut */
  what: string;
}

/** the services of the patching schedule: colour of their cords and labels, and what cutting them costs */
export const SERVICES: Service[] = [
  { name: 'Données', color: '#2f7cf6', weight: 1, what: 'les postes de travail : un fichier qui ne s\'enregistre plus' },
  { name: 'Voix', color: '#2bb24c', weight: 3, what: 'les téléphones IP : un appel coupé, tout le monde l\'entend' },
  { name: 'Vidéo', color: '#f08a1c', weight: 2, what: 'les caméras : un trou dans l\'enregistrement' },
  { name: 'Admin', color: '#e23d3d', weight: 4, what: 'pare-feu, routeur, supervision : sans elle, on travaille à l\'aveugle' },
  { name: 'Stockage', color: '#9b5de5', weight: 3, what: 'serveurs et disques : les machines virtuelles s\'arrêtent' },
  { name: 'Invités', color: '#f2f2f2', weight: 0.25, what: 'le Wi-Fi des visiteurs : personne ne s\'en plaindra' },
];
