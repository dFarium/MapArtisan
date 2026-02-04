import { Link } from 'react-router-dom';

const About: React.FC = () => {
    return (
        <div className="p-8 max-w-2xl mx-auto">
            <h1 className="text-3xl font-bold mb-4">About MapArtisan</h1>
            <p className="mb-4">
                A tool to create Minecraft map art schematics from images.
            </p>
            <Link to="/" className="text-blue-500 hover:underline">Back to Builder</Link>
        </div>
    );
};

export default About;
