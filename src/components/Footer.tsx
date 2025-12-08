import './Footer.css';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer" id="contact">
      <div className="footer-content">
        <div className="contact-section">
          <h2 className="contact-title">Get In Touch</h2>
          <p className="contact-description">
            I'm always interested in discussing new opportunities and collaborations.
            Whether you have a project in mind or just want to connect, feel free to reach out.
          </p>
          <div className="contact-links">
            <a href="mailto:me@abhichandra.com" className="contact-link primary">
              <span className="contact-icon">📧</span>
              me@abhichandra.com
            </a>
            <a href="https://linkedin.com/in/abhishekchandra" target="_blank" rel="noopener noreferrer" className="contact-link">
              <span className="contact-icon">💼</span>
              LinkedIn
            </a>
            <a href="https://github.com/achandra-rp" target="_blank" rel="noopener noreferrer" className="contact-link">
              <span className="contact-icon">🐙</span>
              GitHub
            </a>
          </div>
        </div>

        <div className="footer-bottom">
          <p className="footer-text">
            © {currentYear} Abhishek Chandra. Built with React, TypeScript, and ☕.
          </p>
          <div className="footer-links">
            <a href="https://abhichandra.com" target="_blank" rel="noopener noreferrer">Personal Site</a>
            <a href="https://poetrybyabhishek.com" target="_blank" rel="noopener noreferrer">Poetry</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;