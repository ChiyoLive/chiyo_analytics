export interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
  specs: string[];
  imageUrl: string;
  rating: number;
  reviewsCount: number;
}

export const mockProducts: Product[] = [
  {
    id: "vr-headset",
    name: "Chiyo Spatial VR Headset",
    price: 899,
    description: "Immerse yourself in virtual environments with stunning 4K per-eye resolution, lightweight ergonomics, and next-generation spatial tracking.",
    specs: ["Dual 4K Micro-OLED Screens", "120Hz Refresh Rate", "110° Field of View", "Spatial Audio Integration"],
    imageUrl: "linear-gradient(135deg, #FF3b30 0%, #FF9500 100%)",
    rating: 4.8,
    reviewsCount: 124
  },
  {
    id: "mechanical-keyboard",
    name: "Chiyo Cyber Keyboard Lite",
    price: 189,
    description: "Ultra-responsive mechanical keyboard with pre-lubed linear switches, hot-swappable sockets, and vibrant per-key customizable RGB lighting.",
    specs: ["Hot-Swappable 5-pin Sockets", "Custom Linear Switches (Pre-Lubed)", "PBT Double-shot Keycaps", "Gasket Mounted Plate"],
    imageUrl: "linear-gradient(135deg, #007aff 0%, #00c7be 100%)",
    rating: 4.9,
    reviewsCount: 312
  },
  {
    id: "smart-watch",
    name: "Chiyo Holographic Watch v4",
    price: 349,
    description: "Track your health, receive notifications, and project a beautiful holographic interface on your wrist with a battery that lasts 14 days.",
    specs: ["Holographic Projection UI", "Continuous Heart Rate & SpO2 Monitoring", "Titanium Case", "14-Day Battery Life"],
    imageUrl: "linear-gradient(135deg, #af52de 0%, #ff2d55 100%)",
    rating: 4.7,
    reviewsCount: 88
  },
  {
    id: "noise-headphones",
    name: "Chiyo Sonic Shield Max",
    price: 299,
    description: "Block the outside world with hybrid active noise cancellation (ANC), custom-engineered 40mm dynamic drivers, and high-fidelity lossless wireless audio.",
    specs: ["Hybrid Active Noise Cancellation", "40mm Dynamic Drivers", "Lossless Bluetooth & Wired Audio", "45 Hours Battery Life"],
    imageUrl: "linear-gradient(135deg, #34c759 0%, #30b0c7 100%)",
    rating: 4.6,
    reviewsCount: 204
  }
];
