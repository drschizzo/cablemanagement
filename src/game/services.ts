// The services a patching schedule carries (data, voice, video…): the colour
// of their cords and labels, and what cutting them costs. Their names and
// what they carry are the interface's (ui/names.ts).

export interface Service {
  color: string;
  /** what a second of this service cut costs from the downtime budget */
  weight: number;
}

/** the services of the patching schedule: colour of their cords and labels, and what cutting them costs */
export const SERVICES: Service[] = [
  // data, voice, video, admin, storage, guests
  { color: '#2f7cf6', weight: 1 },
  { color: '#2bb24c', weight: 3 },
  { color: '#f08a1c', weight: 2 },
  { color: '#e23d3d', weight: 4 },
  { color: '#9b5de5', weight: 3 },
  { color: '#f2f2f2', weight: 0.25 },
];
