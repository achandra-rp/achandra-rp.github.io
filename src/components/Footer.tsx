const Footer = () => {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer>
      © {currentYear} Abhishek Chandra
    </footer>
  );
};

export default Footer;