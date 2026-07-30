import ArchitectureSection from './ArchitectureSection'
import CodeSnippetSection from './CodeSnippetSection'
import FeatureGridSection from './FeatureGridSection'
import HeroSection from './HeroSection'
import '../styles/landing.css'

export default function LandingPage() {
  return (
    <div class="site-landing">
      <HeroSection />
      <ArchitectureSection />
      <FeatureGridSection />
      <CodeSnippetSection />
    </div>
  )
}
