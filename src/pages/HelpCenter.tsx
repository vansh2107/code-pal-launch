import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Search, ChevronRight, FileText, Shield, Bell, HelpCircle } from "lucide-react";
import { BottomNavigation } from "@/components/layout/BottomNavigation";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export default function HelpCenter() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const helpCategories = [
    {
      icon: FileText,
      title: "Getting Started",
      description: "Learn the basics of document management"
    },
    {
      icon: Bell,
      title: "Reminders & Notifications",
      description: "Set up and manage your reminders"
    },
    {
      icon: Shield,
      title: "Security & Privacy",
      description: "Keep your documents safe and secure"
    },
    {
      icon: HelpCircle,
      title: "Troubleshooting",
      description: "Common issues and solutions"
    }
  ];

  const faqs = [
    {
      question: "How do I add a new document?",
      answer: "You can add a new document by clicking the 'Scan' button in the navigation bar or the 'Add' button on the Documents page. You can either scan a document or enter the details manually."
    },
    {
      question: "How do reminders work?",
      answer: "Reminders are automatically set based on your document's expiry date and the reminder period you specify. You'll receive notifications before your documents expire."
    },
    {
      question: "Can I edit a document after adding it?",
      answer: "Yes! Click on any document to view its details, then click the 'Edit Document' button to update the information."
    },
    {
      question: "How do I change my notification settings?",
      answer: "Go to Profile > Notification settings to customize when and how you receive reminders."
    },
    {
      question: "Is my data secure?",
      answer: "Yes, all your document data is encrypted and stored securely. We never share your information with third parties."
    },
    {
      question: "Can I export my documents?",
      answer: "Yes, you can export all your documents to CSV format from the Documents page by clicking the 'Export to CSV' button."
    }
  ];

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-card border-b border-border px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Help Center</h1>
            <p className="text-sm text-muted-foreground">Find answers and get support</p>
          </div>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search for help..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </header>

      <main className="px-4 py-6 space-y-6 max-w-2xl mx-auto">
        {/* Help Categories */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Browse by Category</h2>
          <div className="grid grid-cols-1 gap-3">
            {helpCategories.map((category) => (
              <Card key={category.title} className="cursor-pointer hover:bg-muted/50 smooth">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <category.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-medium">{category.title}</h3>
                        <p className="text-sm text-muted-foreground">{category.description}</p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* FAQs */}
        <Card>
          <CardHeader>
            <CardTitle>Frequently Asked Questions</CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((faq, index) => (
                <AccordionItem key={index} value={`item-${index}`}>
                  <AccordionTrigger>{faq.question}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        {/* Contact Support */}
        <Card>
          <CardHeader>
            <CardTitle>Still need help?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Can't find what you're looking for? Our support team is here to help.
            </p>
            <Button className="w-full">Contact Support</Button>
          </CardContent>
        </Card>
      </main>

      <BottomNavigation />
    </div>
  );
}
