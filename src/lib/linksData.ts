// Hardcoded personal shortcut links for the Links page.
// Previously generated from a local `bookmarks.html` Firefox export; migrated
// to a plain data module so the feature doesn't depend on a gitignored file
// existing on disk. Edit this file directly to add/remove links.

export interface BookmarkLink {
  type: "link";
  title: string;
  url: string;
}

export interface BookmarkFolder {
  type: "folder";
  title: string;
  children: BookmarkNode[];
}

export type BookmarkNode = BookmarkLink | BookmarkFolder;

export const LINK_FOLDERS: BookmarkFolder[] = [
  {
    type: "folder",
    title: "lx-booking",
    children: [
      { type: "link", title: "lx-booking SOT Local", url: "http://localhost:3001/?tenant=sot&region=apac" },
      { type: "link", title: "lx-booking SOT FAT", url: "https://sot.fp.lx.apac.fatikat.com/?e2e" },
      { type: "link", title: "lx-booking SOT Staging", url: "https://sot.fp.lx.apac.stagikat.com/?e2e" },
      { type: "link", title: "lx-booking SOT Prod", url: "https://sot.fp.apac.tolynx.com/" },
      { type: "link", title: "lx-booking POF Local", url: "http://localhost:3001/?tenant=pof" },
      { type: "link", title: "lx-booking POF FAT", url: "https://pof.fp.lx.fatikat.com/login" },
      { type: "link", title: "lx-booking POF Staging", url: "https://pof.fp.lx.stagikat.com/login" },
    ],
  },
  {
    type: "folder",
    title: "lx-react-client",
    children: [
      { type: "link", title: "lx-react-client SOT Local", url: "http://localhost:3000/?api=http://localhost:3091&account=http://localhost:3999&tenant=sot" },
      { type: "link", title: "lx-react-client SOT DOCKER", url: "http://localhost:4000/?api=http://localhost:3091&account=http://localhost:3999&tenant=sot" },
      { type: "link", title: "lx-react-client SOT FAT", url: "https://sot.lx.apac.fatikat.com/#/public/login" },
      { type: "link", title: "lx-react-client SOT Staging", url: "https://sot.lx.apac.stagikat.com/#/public/login" },
      { type: "link", title: "lx-react-client SOT Prod", url: "https://sot.apac.tolynx.com/#/public/login" },
      { type: "link", title: "lx-react-client Stena Local", url: "http://localhost:3000/?api=http://localhost:3091&account=http://localhost:3999&tenant=stena" },
      { type: "link", title: "lx-react-client Stena Local to FAT", url: "http://localhost:3000/?api=https://api.blx.fatikat.com&account=https://accounts.blx.fatikat.com&tenant=stena" },
      { type: "link", title: "lx-react-client Stena Local to Staging", url: "http://localhost:3000/?api=https://stena.api.lx.stagikat.com&account=https://accounts.blx.stagikat.com&tenant=stena#/yard-activity" },
      { type: "link", title: "lx-react-client Stena Local to Prod", url: "http://localhost:3000/?api=https://stena.api.svc.tolynx.com&account=https://accounts.bylynx.com&tenant=stena#/public/login" },
      { type: "link", title: "lx-react-client Stena FAT", url: "https://stena.lx.fatikat.com/#/public/login" },
      { type: "link", title: "lx-react-client Stena FAT to Prod", url: "http://stena.lx.fatikat.com/?api=https://stena.api.svc.tolynx.com&account=https://accounts.bylynx.com&tenant=stena#/public/login" },
      { type: "link", title: "lx-react-client Stena Staging to Prod", url: "http://stena.lx.stagikat.com/?api=https://stena.api.svc.tolynx.com&account=https://accounts.bylynx.com&tenant=stena#/public/login" },
      { type: "link", title: "lx-react-client Stena Staging", url: "https://stena.lx.stagikat.com/#/public/login" },
      { type: "link", title: "lx-react-client Stena Prod", url: "https://stena.tolynx.com/#/public/login" },
      { type: "link", title: "lx-react-client KN Local", url: "http://localhost:3000/?api=http://localhost:3091&account=http://localhost:3999&tenant=kn#/" },
      { type: "link", title: "lx-react-client KN Local to FAT", url: "http://localhost:3000/?api=https://api.blx.fatikat.com&account=https://accounts.blx.fatikat.com&tenant=kn#/public/login" },
      { type: "link", title: "lx-react-client KN Local to Staging", url: "http://localhost:3000/?api=https://api.blx.stagikat.com&account=https://accounts.blx.stagikat.com&tenant=kn#/public/login" },
      { type: "link", title: "lx-react-client KN Local to Prod", url: "http://localhost:3000/?api=https://api.svc.tolynx.com&account=https://accounts.bylynx.com&tenant=kn#/public/login" },
      { type: "link", title: "lx-react-client KN FAT", url: "https://kn.lx.fatikat.com/#/trips" },
      { type: "link", title: "lx-react-client KN Staging", url: "https://kn.lx.stagikat.com/#/public/login" },
      { type: "link", title: "lx-react-client KN Prod", url: "https://kn.tolynx.com/#/public/login" },
      { type: "link", title: "lx-react-client POF DOCKER", url: "http://localhost:4000/?api=http://localhost:3091&account=http://localhost:3999&tenant=pof" },
      { type: "link", title: "lx-react-client POF FAT", url: "https://pof.lx.fatikat.com/#/public/login" },
      { type: "link", title: "lx-react-client POF Staging", url: "https://pof.lx.stagikat.com/#/public/login" },
      { type: "link", title: "lx-react-client POF Prod", url: "https://pof.tolynx.com/#/public/login" },
    ],
  },
  {
    type: "folder",
    title: "mc",
    children: [
      { type: "link", title: "mc Local", url: "http://localhost:5173/" },
      { type: "link", title: "mc FAT", url: "https://mc.blx.fatikat.com/" },
      { type: "link", title: "mc Staging", url: "https://mc.blx.stagikat.com/" },
      { type: "link", title: "mc Prod", url: "https://mc.bylynx.com/" },
      { type: "link", title: "mc FAT APAC", url: "https://mc.apac.fatikat.com/" },
      { type: "link", title: "mc Staging APAC", url: "https://mc.apac.stagikat.com/" },
      { type: "link", title: "mc Prod APAC", url: "https://mc.apac.bylynx.com/" },
    ],
  },
  {
    type: "folder",
    title: "rabbitMQ",
    children: [
      { type: "link", title: "RabbitMQ Local", url: "http://localhost:15672/" },
      { type: "link", title: "RabbitMQ FAT", url: "https://primary.rabbitmq.ops.fatikat.com/" },
      { type: "link", title: "RabbitMQ Staging", url: "https://primary.rabbitmq.ops.stagikat.com/" },
      { type: "link", title: "RabbitMQ Prod", url: "https://primary.rabbitmq.ops.bylynx.com/" },
      { type: "link", title: "RabbitMQ FAT APAC", url: "https://rabbitmq.blx.apac.fatikat.com/#/" },
      { type: "link", title: "RabbitMQ Staging APAC", url: "https://rabbitmq.blx.apac.stagikat.com/#/" },
      { type: "link", title: "RabbitMQ Prod APAC", url: "https://rabbitmq.apac.bylynx.com/" },
    ],
  },
  {
    type: "folder",
    title: "gos",
    children: [
      { type: "link", title: "gos Local", url: "http://localhost:8899/admin" },
      { type: "link", title: "gos Prod", url: "https://gos.bylynx.com/admin" },
      { type: "link", title: "gos Pof Local", url: "http://localhost:8899/admin?tenant=pof" },
      { type: "link", title: "gos Pof Prod", url: "https://gos.bylynx.com/admin?tenant=pof" },
      { type: "link", title: "gos Sot Local", url: "http://localhost:8899/admin?tenant=sot" },
      { type: "link", title: "gos Sot Prod", url: "https://gos.bylynx.com/admin?tenant=sot" },
      { type: "link", title: "gos Stenaline Local", url: "http://localhost:8899/admin?tenant=stenaline" },
      { type: "link", title: "gos Stenaline Prod", url: "https://gos.bylynx.com/admin?tenant=stenaline" },
      { type: "link", title: "gos Scandlines Local", url: "http://localhost:8899/admin?tenant=scandlines" },
      { type: "link", title: "gos Scandlines Prod", url: "https://gos.bylynx.com/admin?tenant=scandlines" },
      { type: "link", title: "gos Peelports Local", url: "http://localhost:8899/admin?tenant=peelports" },
      { type: "link", title: "gos Peelports Prod", url: "https://gos.bylynx.com/admin?tenant=peelports" },
    ],
  },
  {
    type: "folder",
    title: "TAPI admin",
    children: [
      { type: "link", title: "TAPI Local", url: "http://localhost:3012/" },
      { type: "link", title: "TAPI FAT", url: "https://admin.tapi.blx.fatikat.com/" },
      { type: "link", title: "TAPI Staging", url: "https://admin.tapi.blx.stagikat.com/" },
      { type: "link", title: "TAPI Prod", url: "https://admin.tapi.bylynx.com/" },
      { type: "link", title: "TAPI FAT APAC", url: "https://admin.tapi.blx.apac.fatikat.com/" },
      { type: "link", title: "TAPI Staging APAC", url: "https://admin.tapi.blx.apac.stagikat.com/" },
      { type: "link", title: "TAPI Prod APAC", url: "https://admin.tapi.apac.bylynx.com/" },
    ],
  },
  {
    type: "folder",
    title: "Smart Yard",
    children: [
      { type: "link", title: "TLE BELF1 Local", url: "http://localhost:3002/embed?route=/yard-dashboard&state=port:BELF1&token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6InN1cmlrYXQtdGVzdC11c2VyLWlkIiwic291cmNlIjoibG9jYWwiLCJuYW1lIjoiU3VyaWthdCIsInN1cm5hbWUiOiJVc2VyIiwiZW1haWxzIjpbImluZm9Ac3VyaWthdC5jb20iXSwicGhvdG9zIjpbXSwiaXNPbmxpbmVPbmx5IjpmYWxzZSwicm9sZXMiOlsic3VwZXJ1c2VyIiwidHVnLW9wZXJhdG9yIiwidXNlciIsInN1cGVydmlzb3IiLCJjbGFpbS1oYW5kbGVyIiwidHVnLW1hbmFnZXIiLCJyZXBvcnRlciIsInJlYWNoLW9wZXJhdG9yIiwiZ29kIl0sInRlbmFudCI6InN0ZW5hbGluZSJ9.tThcjHP0JdrLWxo-h5Xn7E-wlQKfLBmj6XnM6tjDjG4" },
      { type: "link", title: "TLE BELF Local", url: "http://localhost:3002/embed?route=/yard-dashboard&state=port:BELF&token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6InN1cmlrYXQtdGVzdC11c2VyLWlkIiwic291cmNlIjoibG9jYWwiLCJuYW1lIjoiU3VyaWthdCIsInN1cm5hbWUiOiJVc2VyIiwiZW1haWxzIjpbImluZm9Ac3VyaWthdC5jb20iXSwicGhvdG9zIjpbXSwiaXNPbmxpbmVPbmx5IjpmYWxzZSwicm9sZXMiOlsic3VwZXJ1c2VyIiwidHVnLW9wZXJhdG9yIiwidXNlciIsInN1cGVydmlzb3IiLCJjbGFpbS1oYW5kbGVyIiwidHVnLW1hbmFnZXIiLCJyZXBvcnRlciIsInJlYWNoLW9wZXJhdG9yIiwiZ29kIl0sInRlbmFudCI6InN0ZW5hbGluZSJ9.tThcjHP0JdrLWxo-h5Xn7E-wlQKfLBmj6XnM6tjDjG4" },
      { type: "link", title: "TLE BELF1 FAT", url: "https://tle.lx.fatikat.com/embed?route=/yard-dashboard&state=port:BELF1&token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6InN1cmlrYXQtdGVzdC11c2VyLWlkIiwic291cmNlIjoibG9jYWwiLCJuYW1lIjoiU3VyaWthdCIsInN1cm5hbWUiOiJVc2VyIiwiZW1haWxzIjpbImluZm9Ac3VyaWthdC5jb20iXSwicGhvdG9zIjpbXSwiaXNPbmxpbmVPbmx5IjpmYWxzZSwicm9sZXMiOlsic3VwZXJ1c2VyIiwidHVnLW9wZXJhdG9yIiwidXNlciIsInN1cGVydmlzb3IiLCJjbGFpbS1oYW5kbGVyIiwidHVnLW1hbmFnZXIiLCJyZXBvcnRlciIsInJlYWNoLW9wZXJhdG9yIiwiZ29kIl0sInRlbmFudCI6InN0ZW5hbGluZSJ9.tThcjHP0JdrLWxo-h5Xn7E-wlQKfLBmj6XnM6tjDjG4" },
      { type: "link", title: "TLE BELF FAT", url: "https://tle.lx.fatikat.com/embed?route=/yard-dashboard&state=port:BELF&token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6InN1cmlrYXQtdGVzdC11c2VyLWlkIiwic291cmNlIjoibG9jYWwiLCJuYW1lIjoiU3VyaWthdCIsInN1cm5hbWUiOiJVc2VyIiwiZW1haWxzIjpbImluZm9Ac3VyaWthdC5jb20iXSwicGhvdG9zIjpbXSwiaXNPbmxpbmVPbmx5IjpmYWxzZSwicm9sZXMiOlsic3VwZXJ1c2VyIiwidHVnLW9wZXJhdG9yIiwidXNlciIsInN1cGVydmlzb3IiLCJjbGFpbS1oYW5kbGVyIiwidHVnLW1hbmFnZXIiLCJyZXBvcnRlciIsInJlYWNoLW9wZXJhdG9yIiwiZ29kIl0sInRlbmFudCI6InN0ZW5hbGluZSJ9.tThcjHP0JdrLWxo-h5Xn7E-wlQKfLBmj6XnM6tjDjG4" },
      { type: "link", title: "TLE BELF1 Staging", url: "https://tle.lx.stagikat.com/embed?route=/yard-dashboard&state=port:BELF1&token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6InN1cmlrYXQtdGVzdC11c2VyLWlkIiwic291cmNlIjoibG9jYWwiLCJuYW1lIjoiU3VyaWthdCIsInN1cm5hbWUiOiJVc2VyIiwiZW1haWxzIjpbImluZm9Ac3VyaWthdC5jb20iXSwicGhvdG9zIjpbXSwiaXNPbmxpbmVPbmx5IjpmYWxzZSwicm9sZXMiOlsic3VwZXJ1c2VyIiwidHVnLW9wZXJhdG9yIiwidXNlciIsInN1cGVydmlzb3IiLCJjbGFpbS1oYW5kbGVyIiwidHVnLW1hbmFnZXIiLCJyZXBvcnRlciIsInJlYWNoLW9wZXJhdG9yIiwiZ29kIl0sInRlbmFudCI6InN0ZW5hbGluZSJ9.tThcjHP0JdrLWxo-h5Xn7E-wlQKfLBmj6XnM6tjDjG4" },
      { type: "link", title: "TLE BELF Staging", url: "https://tle.lx.stagikat.com/embed?route=/yard-dashboard&state=port:BELF&token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6InN1cmlrYXQtdGVzdC11c2VyLWlkIiwic291cmNlIjoibG9jYWwiLCJuYW1lIjoiU3VyaWthdCIsInN1cm5hbWUiOiJVc2VyIiwiZW1haWxzIjpbImluZm9Ac3VyaWthdC5jb20iXSwicGhvdG9zIjpbXSwiaXNPbmxpbmVPbmx5IjpmYWxzZSwicm9sZXMiOlsic3VwZXJ1c2VyIiwidHVnLW9wZXJhdG9yIiwidXNlciIsInN1cGVydmlzb3IiLCJjbGFpbS1oYW5kbGVyIiwidHVnLW1hbmFnZXIiLCJyZXBvcnRlciIsInJlYWNoLW9wZXJhdG9yIiwiZ29kIl0sInRlbmFudCI6InN0ZW5hbGluZSJ9.tThcjHP0JdrLWxo-h5Xn7E-wlQKfLBmj6XnM6tjDjG4" },
      { type: "link", title: "TLE BELF1 Production", url: "https://tle.bylynx.com/embed?route=/yard-dashboard&state=port:BELF1&token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6InN1cmlrYXQtdGVzdC11c2VyLWlkIiwic291cmNlIjoibG9jYWwiLCJuYW1lIjoiU3VyaWthdCIsInN1cm5hbWUiOiJVc2VyIiwiZW1haWxzIjpbImluZm9Ac3VyaWthdC5jb20iXSwicGhvdG9zIjpbXSwiaXNPbmxpbmVPbmx5IjpmYWxzZSwicm9sZXMiOlsic3VwZXJ1c2VyIiwidHVnLW9wZXJhdG9yIiwidXNlciIsInN1cGVydmlzb3IiLCJjbGFpbS1oYW5kbGVyIiwidHVnLW1hbmFnZXIiLCJyZXBvcnRlciIsInJlYWNoLW9wZXJhdG9yIiwiZ29kIl0sInRlbmFudCI6InN0ZW5hbGluZSJ9.tThcjHP0JdrLWxo-h5Xn7E-wlQKfLBmj6XnM6tjDjG4" },
      { type: "link", title: "TLE BELF Production", url: "https://tle.bylynx.com/embed?route=/yard-dashboard&state=port:BELF&token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6InN1cmlrYXQtdGVzdC11c2VyLWlkIiwic291cmNlIjoibG9jYWwiLCJuYW1lIjoiU3VyaWthdCIsInN1cm5hbWUiOiJVc2VyIiwiZW1haWxzIjpbImluZm9Ac3VyaWthdC5jb20iXSwicGhvdG9zIjpbXSwiaXNPbmxpbmVPbmx5IjpmYWxzZSwicm9sZXMiOlsic3VwZXJ1c2VyIiwidHVnLW9wZXJhdG9yIiwidXNlciIsInN1cGVydmlzb3IiLCJjbGFpbS1oYW5kbGVyIiwidHVnLW1hbmFnZXIiLCJyZXBvcnRlciIsInJlYWNoLW9wZXJhdG9yIiwiZ29kIl0sInRlbmFudCI6InN0ZW5hbGluZSJ9.tThcjHP0JdrLWxo-h5Xn7E-wlQKfLBmj6XnM6tjDjG4" },
      { type: "link", title: "Smart Yard weekly - Google Sheets", url: "https://docs.google.com/spreadsheets/d/1Ev1d0JmH9DvFzrzcfbRlTKHIGznvhT2XYczcfCfQKjk/edit?gid=0#gid=0" },
    ],
  },
  {
    type: "folder",
    title: "TLE",
    children: [
      { type: "link", title: "TLE Stena Local", url: "http://localhost:3002/login?tenant=stenaline" },
      { type: "link", title: "TLE Stena FAT", url: "https://tle.lx.fatikat.com/login?tenant=stenaline" },
      { type: "link", title: "TLE Stena Staging", url: "https://tle.lx.stagikat.com/login?tenant=stenaline" },
      { type: "link", title: "TLE Stena Prod", url: "https://tle.bylynx.com/login?tenant=stenaline" },
    ],
  },
  {
    type: "folder",
    title: "NodeRed",
    children: [
      { type: "link", title: "NodeRed Local", url: "http://localhost:1880/#flow/f688d225c5e143b3" },
      { type: "link", title: "NodeRed Scandlines FAT", url: "https://scandlines.nodered.blx.fatikat.com/#flow/f688d225c5e143b3" },
    ],
  },
  {
    type: "folder",
    title: "lx-vms-kiosk-fe",
    children: [
      { type: "link", title: "kiosk-fe Rødby Local", url: "http://localhost:3672/ROF?tenant=scandlines" },
    ],
  },
];
